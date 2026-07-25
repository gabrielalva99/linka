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
        startInForeground()
        if (timer == null) {
            timer = Timer().also {
                it.scheduleAtFixedRate(timerTask { Telemetry.beat(this@HeartbeatService) }, 0L, 60_000L)
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
