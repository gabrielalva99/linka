package com.linka.agent

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Qual vídeo esteve na tela, de quando até quando.
 *
 * O painel sempre soube o que está no ar AGORA — e só isso. O valor anterior era
 * sobrescrito a cada batida e sumia. Ou seja: dava para responder "o que está
 * tocando" e nada sobre ontem.
 *
 * É a metade que faltava para ligar conteúdo a comportamento. Com o instante em
 * que o cliente pegou o aparelho de um lado e o instante de cada vídeo do outro,
 * "qual vídeo faz a pessoa parar" vira medição em vez de opinião — que é a
 * pergunta que a marca realmente quer responder.
 *
 * Regra de ouro daqui: o relatório de ontem tem que estar completo hoje de
 * manhã. Por isso um trecho nunca fica aberto por mais de uma hora, mesmo que o
 * mesmo vídeo rode a semana inteira.
 */
object MediaLog {

    /** Teto de um trecho. Acima disso, fecha e reabre o mesmo vídeo. */
    private const val MAX_TRECHO_MS = 3_600_000L

    /**
     * Silêncio que denuncia app reiniciado. O serviço dá sinal de vida a cada
     * 60s; passou disso, o aparelho esteve desligado ou o app morreu, e o tempo
     * decorrido NÃO foi exibição.
     */
    private const val SILENCIO_MS = 300_000L

    /** Troca de conteúdo passando não é exibição. */
    private const val MIN_SEGUNDOS = 2L

    private val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    /**
     * Alinha o trecho aberto com o que está de fato na tela.
     *
     * Chamado de dois lugares de propósito: da tela, no instante em que o
     * conteúdo troca (precisão), e do serviço a cada minuto (rede de segurança —
     * a tela pode ter sido morta pelo sistema no meio da troca). Chamar duas
     * vezes seguidas não faz nada na segunda.
     */
    @Synchronized
    fun reconciliar(ctx: Context) {
        val naTela = Prefs.playingUrl(ctx)
        val aberta = Prefs.mediaUrl(ctx)
        val agora = System.currentTimeMillis()
        val vivoAte = Prefs.mediaAlive(ctx)

        // App reiniciado: o trecho fecha no último sinal de vida. Fechar em
        // "agora" faturaria como exibição a noite em que o aparelho ficou
        // desligado — número inventado, o pior tipo de erro num relatório.
        val fim = if (vivoAte > 0 && agora - vivoAte > SILENCIO_MS) vivoAte else agora

        if (aberta != null) {
            val estourou = fim - Prefs.mediaSince(ctx) >= MAX_TRECHO_MS
            if (aberta != naTela || estourou) {
                fechar(ctx, fim)
                // Mesmo vídeo continuando: reabre a partir do corte, sem buraco.
                if (aberta == naTela) Prefs.setMediaOpen(ctx, aberta, fim)
            }
        }
        if (Prefs.mediaUrl(ctx) == null && naTela != null) {
            Prefs.setMediaOpen(ctx, naTela, agora)
        }
        Prefs.setMediaAlive(ctx, agora)
    }

    /** Roda fora da thread da tela: gravar em banco não pode travar o vídeo. */
    fun reconciliarAsync(ctx: Context) {
        Thread { reconciliar(ctx) }.start()
    }

    private fun fechar(ctx: Context, ate: Long) {
        val url = Prefs.mediaUrl(ctx) ?: return
        val inicio = Prefs.mediaSince(ctx)
        Prefs.clearMediaOpen(ctx)
        if (inicio <= 0) return
        val segundos = (ate - inicio) / 1000
        if (segundos < MIN_SEGUNDOS) return

        val fila = EventQueue(ctx)
        try {
            // Mesmo desenho de id do resto da telemetria: dois instantes iguais
            // no mesmo aparelho não existem, então reenvio não vira contagem
            // dobrada no BI.
            fila.add(
                eventId = "media_play:$inicio",
                kind = "media_play",
                pkg = null,
                startedAt = iso.format(Date(inicio)),
                endedAt = iso.format(Date(ate)),
                durationSeconds = segundos,
                mediaUrl = url,
            )
        } finally {
            fila.close()
        }
    }
}
