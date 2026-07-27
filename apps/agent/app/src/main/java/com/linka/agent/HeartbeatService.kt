package com.linka.agent

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import java.util.Timer
import kotlin.concurrent.timerTask

/** Serviço em primeiro plano que reporta o heartbeat a cada 60s. */
class HeartbeatService : Service() {

    private var timer: Timer? = null
    private var idleTimer: Timer? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Api.init(this)
        startInForeground()
        if (timer == null) {
            timer = Timer().also {
                it.scheduleAtFixedRate(
                    timerTask {
                        Telemetry.beat(this@HeartbeatService)
                        checkCleanup()
                        coletarEEnviarEventos()
                    },
                    0L, 60_000L,
                )
            }
        }
        if (idleTimer == null) {
            idleTimer = Timer().also {
                it.scheduleAtFixedRate(timerTask { checkIdle() }, 5_000L, 5_000L)
            }
        }
        return START_STICKY
    }

    /**
     * Traz a vitrine de volta quando o aparelho foi deixado fora do app.
     * Quem vigia é o serviço (e não a tela) porque a tela está justamente parada
     * em segundo plano quando isso precisa acontecer.
     */
    /**
     * A faxina roda no serviço, não na tela: às 23h a vitrine está tocando vídeo
     * sozinha há horas e ninguém vai abrir o app para disparar isso.
     */
    private fun checkCleanup() {
        if (!Cleanup.shouldRun(this)) return
        val report = Cleanup.run(this)
        Prefs.setPendingCleanupReport(this, report)
        Telemetry.beatAsync(this)
    }

    /**
     * Lê o uso do aparelho, guarda na fila local e envia o que der. O envio só
     * limpa a fila com confirmação do servidor — queda de rede adia, não perde.
     */
    private fun coletarEEnviarEventos() {
        val token = Prefs.token(this) ?: return
        val fila = EventQueue(this)
        try {
            Interaction.collect(this, fila)
            var restam = fila.size()
            // Manda em lotes até esvaziar (ou até a rede falhar).
            while (restam > 0) {
                val (ids, lote) = fila.pending(200)
                if (ids.isEmpty()) break
                val r = try {
                    Api.events(token, lote)
                } catch (_: Exception) {
                    return
                }
                if (r.code !in 200..299) return
                fila.remove(ids)
                restam = fila.size()
            }
        } finally {
            fila.close()
        }
    }

    private fun checkIdle() {
        val leftAt = Prefs.leftAt(this)
        if (leftAt == 0L || Prefs.token(this) == null) return
        val limitMs = Prefs.idleReturnSeconds(this) * 1000L
        if (System.currentTimeMillis() - leftAt < limitMs) return
        // Tela apagada: não é hora de acordar a loja no meio da madrugada.
        if (!Health.screenOn(this)) return

        Prefs.setLeftAt(this, 0L)
        val intent = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        }
        try {
            startActivity(intent)
        } catch (_: Exception) {
            // Sem permissão de abrir em segundo plano: o provisionamento concede.
        }
    }

    private fun startInForeground() {
        val channelId = "linka_agent"
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(
                channelId, "LINKA Agente", NotificationManager.IMPORTANCE_LOW
            )
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
        val builder = if (Build.VERSION.SDK_INT >= 26) {
            Notification.Builder(this, channelId)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        val notification = builder
            .setContentTitle("LINKA")
            .setContentText("Agente ativo")
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .build()

        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(1, notification)
        }
    }

    override fun onDestroy() {
        timer?.cancel()
        timer = null
        idleTimer?.cancel()
        idleTimer = null
        super.onDestroy()
    }
}
