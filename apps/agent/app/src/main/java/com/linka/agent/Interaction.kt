package com.linka.agent

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * O que o cliente fez com o aparelho na loja.
 *
 * Duas perguntas que o BI da ProSolution consome hoje:
 *  - alguém pegou o aparelho? (tela acendeu, e por quanto tempo ficou em uso)
 *  - o que ele abriu, e quanto tempo em cada coisa?
 *
 * A fonte é o próprio Android (uso por app). Esse dado **não é entregue a app
 * comum** — só existe porque somos dono do aparelho e a permissão é concedida no
 * provisionamento. É a diferença entre "achamos que a vitrine engaja" e saber.
 *
 * Limite declarado: mede troca de tela e tempo, não toque dentro de outro app.
 * Toque a gente mede dentro do LINKA, onde o app é nosso.
 */
object Interaction {

    /** Só sessões acima disso viram evento: passar o dedo não é interação. */
    private const val MIN_SEGUNDOS = 2L

    /** Nunca reportamos o próprio LINKA como "uso do cliente". */
    private const val NOSSO_PACOTE = "com.linka.agent"

    /**
     * Telas do sistema que aparecem POR CIMA de um app (pedido de permissão,
     * painel de volume). Elas não são "o que o cliente foi usar": são do app que
     * as abriu. Medido no aparelho: o YouTube abriu, o pedido de permissão cobriu
     * a tela por 11s e o relatório dizia "cliente usou o permissioncontroller".
     *
     * O Android guarda o dono da tela, mas não expõe isso em API pública
     * (`taskRootPackageName` não compila) — então tratamos como transparentes: não
     * encerram a sessão de quem está embaixo.
     */
    private val TRANSPARENTES = setOf(
        "com.google.android.permissioncontroller",
        "com.android.permissioncontroller",
        "com.android.systemui",
        "com.google.android.packageinstaller",
        "com.android.packageinstaller",
    )

    private val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    fun disponivel(ctx: Context): Boolean =
        try {
            val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val agora = System.currentTimeMillis()
            usm.queryEvents(agora - 60_000, agora).hasNextEvent()
        } catch (_: Exception) {
            false
        }

    /**
     * Lê o que aconteceu desde a última leitura e enfileira.
     * O marcador de onde parou fica gravado: reinício do app não recontá nem pula.
     */
    fun collect(ctx: Context, queue: EventQueue): Int {
        val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val agora = System.currentTimeMillis()
        // Na primeira vez olha 1h para trás; depois, só o que é novo.
        val desde = Prefs.lastEventScan(ctx).takeIf { it > 0 } ?: (agora - 3_600_000)
        if (agora <= desde) return 0

        // UM app em primeiro plano por vez, não um mapa de pares.
        // Um app tem várias telas internas (o Chrome abre ChromeLauncherActivity e
        // depois ChromeTabbedActivity): contando par a par, uma visita de 9s virava
        // dois pedaços — o que infla a contagem de sessões e derruba a média no BI.
        var atual: String? = null
        var atualDesde = 0L
        var telaLigadaEm = 0L
        var gravados = 0

        try {
            val eventos = usm.queryEvents(desde, agora)
            val e = UsageEvents.Event()
            while (eventos.hasNextEvent()) {
                eventos.getNextEvent(e)
                when (e.eventType) {
                    UsageEvents.Event.ACTIVITY_RESUMED -> {
                        // Diálogo do sistema não troca de app: o tempo continua
                        // sendo de quem está embaixo.
                        if (e.packageName !in TRANSPARENTES && e.packageName != atual) {
                            // Trocou de app de verdade: fecha o anterior e abre o novo.
                            if (atual != null) {
                                gravados += enfileirar(
                                    queue, "app_usage", atual, atualDesde, e.timeStamp,
                                )
                            }
                            atual = e.packageName
                            atualDesde = e.timeStamp
                        }
                    }
                    UsageEvents.Event.ACTIVITY_PAUSED -> {
                        // Pausa de outra tela do MESMO app não encerra a visita:
                        // quem encerra é a entrada de outro app.
                    }
                    UsageEvents.Event.SCREEN_INTERACTIVE -> telaLigadaEm = e.timeStamp
                    UsageEvents.Event.SCREEN_NON_INTERACTIVE -> {
                        if (telaLigadaEm > 0) {
                            gravados += enfileirar(
                                queue, "screen_session", null, telaLigadaEm, e.timeStamp,
                            )
                            telaLigadaEm = 0
                        }
                    }
                }
            }
        } catch (_: Exception) {
            return 0
        }

        // Sessão ainda aberta no fim da leitura: não fecha à força — o marcador
        // volta para onde ela começou e ela é fechada na próxima passada, inteira.
        val ateOnde = if (atual != null) atualDesde else agora
        Prefs.setLastEventScan(ctx, ateOnde)
        return gravados
    }

    private fun enfileirar(
        queue: EventQueue,
        kind: String,
        pkg: String?,
        inicio: Long,
        fim: Long,
    ): Int {
        val segundos = (fim - inicio) / 1000
        if (segundos < MIN_SEGUNDOS) return 0
        if (pkg == NOSSO_PACOTE) return 0
        // id determinístico: o mesmo intervalo lido duas vezes não duplica.
        val eventId = "$kind:${pkg ?: "tela"}:$inicio"
        queue.add(
            eventId, kind, pkg, iso.format(Date(inicio)), iso.format(Date(fim)), segundos,
        )
        return 1
    }
}
