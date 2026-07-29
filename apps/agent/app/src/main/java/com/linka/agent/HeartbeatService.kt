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
                        reforcarPermissoes()
                    },
                    0L, 60_000L,
                )
            }
        }
        if (idleTimer == null) {
            idleTimer = Timer().also {
                it.scheduleAtFixedRate(
                    timerTask { checkManutencao(); checkIdle(); checkScreen() }, 5_000L, 5_000L,
                )
            }
        }
        return START_STICKY
    }

    /**
     * Fecha a janela de manutenção quando o tempo vence.
     *
     * Quem tranca de novo é o SERVIÇO, e não a tela, porque o caso que importa é
     * exatamente aquele em que a tela não está mais na frente: o técnico
     * destravou, foi para os Ajustes e saiu da loja. A tela dele já morreu; o
     * serviço continua de pé.
     *
     * Roda antes do retorno automático de propósito — assim o vencimento da
     * manutenção é sempre decidido no mesmo ciclo em que a vitrine volta, sem
     * uma volta de 5 segundos em que o aparelho fica destravado e sem ninguém
     * olhando.
     */
    private fun checkManutencao() {
        val ate = Prefs.manutencaoAte(this)
        if (ate == 0L || System.currentTimeMillis() < ate) return
        Prefs.setManutencaoAte(this, 0L)
        try {
            startActivity(
                Intent(this, MainActivity::class.java).apply {
                    putExtra(MainActivity.EXTRA_RETRANCAR, true)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                },
            )
        } catch (_: Exception) {
        }
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
        // Antes de ler o uso: acerta o trecho de vídeo em aberto. Fica aqui e não
        // só na tela porque a tela pode ter sido morta pelo sistema no meio de
        // uma troca — e porque é o que fecha o trecho de hora em hora, para o
        // relatório de ontem estar completo hoje de manhã.
        MediaLog.reconciliar(this)

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

    private var voltasDoRelogio = 0

    /**
     * Reaplica as permissões de demonstração de dez em dez minutos.
     *
     * Antes isso rodava só quando a tela do app abria. Um aparelho que se
     * atualizou sozinho, ou que instalou um app depois, voltava a pedir
     * permissão ao cliente — foi o que aconteceu com um Razr recém-atualizado,
     * que pediu câmera na loja mesmo já estando na versão nova.
     *
     * O serviço está sempre de pé, então é ele que garante. Conceder de novo o
     * que já está concedido não custa nada e não pisca na tela.
     */
    private fun reforcarPermissoes() {
        voltasDoRelogio++
        if (voltasDoRelogio % 10 != 1) return
        try {
            Kiosk.liberarPermissoesDeDemonstracao(this)
            Kiosk.autorizarNoQuiosque(this)
        } catch (_: Exception) {
        }
    }

    /**
     * Está dentro do expediente da loja? Hora local do aparelho, que é a hora
     * da loja onde ele está. Expediente que não vira a noite (loja de shopping).
     */
    private fun lojaAberta(): Boolean {
        val agora = java.util.Calendar.getInstance()
        val minutos = agora.get(java.util.Calendar.HOUR_OF_DAY) * 60 +
            agora.get(java.util.Calendar.MINUTE)
        fun paraMinutos(hhmm: String): Int? {
            val p = hhmm.split(":")
            val h = p.getOrNull(0)?.toIntOrNull() ?: return null
            val m = p.getOrNull(1)?.toIntOrNull() ?: return null
            return h * 60 + m
        }
        val abre = paraMinutos(Prefs.storeOpensAt(this)) ?: return true
        val fecha = paraMinutos(Prefs.storeClosesAt(this)) ?: return true
        return minutos in abre until fecha
    }

    /**
     * Vitrine apagada com a loja aberta é vitrine morta.
     *
     * Não basta cuidar de quem sai do app: qualquer pessoa aperta o botão de
     * ligar e apaga a tela, e aí o aparelho fica preto no meio da loja até
     * alguém encostar nele. Com a loja aberta, a vitrine acende de volta em até
     * 5 segundos. Com a loja fechada não faz nada, para não gastar bateria nem
     * queimar a tela a noite inteira.
     */
    private fun checkScreen() {
        if (Prefs.token(this) == null) return
        // Manutenção em curso: não acende nem puxa nada. O técnico pode estar com
        // a tela apagada de propósito, conferindo o aparelho.
        if (Prefs.emManutencao(this)) return
        if (Health.screenOn(this)) return
        if (!lojaAberta()) return
        try {
            startActivity(
                Intent(this, MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                },
            )
        } catch (_: Exception) {
            // Sem permissão de abrir em segundo plano: o provisionamento concede.
        }
    }

    private fun checkIdle() {
        val leftAt = Prefs.leftAt(this)
        if (leftAt == 0L || Prefs.token(this) == null) return
        // Manutenção em curso: o retorno automático fica suspenso.
        //
        // Sem isto a saída de manutenção não serviria para nada: o técnico abre os
        // Ajustes, e 30 segundos depois o serviço arranca ele de lá e devolve a
        // vitrine. Duas proteções nossas se anulando — e a culpa cairia no
        // aparelho, que "não deixa mexer".
        if (Prefs.emManutencao(this)) return
        val limitMs = Prefs.idleReturnSeconds(this) * 1000L
        if (System.currentTimeMillis() - leftAt < limitMs) return
        // Tela apagada com a loja FECHADA: deixa quieto, ninguém vai passar na
        // frente e insistir só gasta bateria e queima a tela.
        //
        // Com a loja ABERTA é o contrário: vitrine preta é vitrine morta. Isso
        // acontece quando o cliente larga o aparelho dentro de outro app e o
        // Android apaga a tela pelo tempo limite do sistema. Antes o aparelho
        // ficava escuro até alguém encostar; agora a vitrine volta e acende.
        if (!Health.screenOn(this) && !lojaAberta()) return

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
                channelId, "LINKA", NotificationManager.IMPORTANCE_LOW
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
            .setContentText("Vitrine ativa")
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
