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
        // A MEDIÇÃO COMEÇA AGORA, e não uma hora atrás.
        //
        // Antes a primeira leitura olhava 60 minutos para trás, e isso importava
        // uso que não é de vitrine nenhuma: o técnico removendo contas nos
        // Ajustes, o aparelho ligando pela primeira vez, o que a loja fez com ele
        // antes de virar demonstração. Tudo entrava no relatório como recurso que
        // o cliente experimentou.
        //
        // Foi assim que `com.motorola.batterycare` apareceu num aparelho de teste
        // e ficou pendente de identificação: veio do preparo, antes do LINKA
        // existir ali. Com 250 aparelhos no rollout, é uma hora de uso alheio por
        // aparelho, tudo no mesmo dia, no dia em que ninguém ainda desconfia dos
        // números.
        //
        // Não se perde nada real: na primeira leitura o aparelho acabou de ser
        // provisionado e a vitrine ainda nem subiu. Não existe medição legítima
        // atrás desse ponto.
        val desde = Prefs.lastEventScan(ctx).takeIf { it > 0 } ?: agora
        if (agora <= desde) {
            // Marca o ponto de partida, senão a próxima passada olharia para trás
            // de novo e o problema voltaria pela porta do "ainda não tem marcador".
            Prefs.setLastEventScan(ctx, agora)
            return 0
        }

        // UM app em primeiro plano por vez, não um mapa de pares.
        // Um app tem várias telas internas (o Chrome abre ChromeLauncherActivity e
        // depois ChromeTabbedActivity): contando par a par, uma visita de 9s virava
        // dois pedaços — o que infla a contagem de sessões e derruba a média no BI.
        //
        // O trecho já em andamento vem da memória, e não de reler o histórico: ver
        // Prefs.sessaoAberta. É isso que permite a leitura andar sempre para a
        // frente, em vez de voltar ao começo do trecho a cada passada.
        var atual: String? = Prefs.sessaoAbertaPkg(ctx)
        var atualDesde = if (atual != null) Prefs.sessaoAbertaDesde(ctx) else 0L
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
                                    queue, tipoDe(atual), atual, atualDesde, e.timeStamp,
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
                        // Tela apagada encerra a sessão: sem isso, um aparelho
                        // que dorme (bateria fraca, tela quebrada) acumularia
                        // horas de "vitrine" que ninguém viu. Hoje a vitrine
                        // segura a tela ligada, mas o dado não pode depender
                        // disso continuar verdade.
                        if (atual != null) {
                            gravados += enfileirar(
                                queue, tipoDe(atual), atual, atualDesde, e.timeStamp,
                            )
                            atual = null
                            atualDesde = 0
                        }
                    }
                }
            }
        } catch (_: Exception) {
            return 0
        }

        // ── Trecho ainda aberto: grava o que já virou hora cheia ────────────
        //
        // O DEFEITO QUE ISTO CONSERTA. Antes, um trecho aberto não virava dado: o
        // marcador voltava para o começo dele e a gravação esperava alguém
        // INTERROMPER a vitrine. Numa loja movimentada quase não se nota — cada
        // cliente que pega o aparelho fecha um trecho. Mas o erro cai sempre para o
        // mesmo lado: quanto menos gente encosta, mais atrasado fica o número.
        // Os pontos mais parados, que são os que precisam ser vistos, eram os que
        // apareciam mais vazios.
        //
        // Medido em 03/08 nos dois aparelhos de teste: o 663E tinha um trecho de
        // 26 HORAS gravado de uma vez só, no instante em que alguém finalmente
        // encostou nele, e outros dois dias ainda sem gravar. O 2CD3, que ninguém
        // tocou desde sexta, tinha zero hora de vitrine exibindo o tempo todo — e o
        // painel o acusava de "pode ser aparelho com problema".
        //
        // POR HORA CHEIA, e não a cada passada. O relógio do serviço bate de 60 em
        // 60 segundos; gravar um pedaço por batida daria 60 eventos por hora por
        // aparelho, e a conta de eventos foi justamente o que passamos o dia
        // enxugando. Fechando na virada da hora é no máximo UM evento por hora, e
        // ainda casa com o grão do relatório, que é por hora local.
        //
        // A hora corrente fica aberta de propósito: ela ainda não terminou, e
        // fechá-la agora seria inventar um fim que não aconteceu.
        var ateOnde = agora
        if (atual != null) {
            val fronteira = inicioDaHora(agora)
            if (atualDesde < fronteira) {
                // UM TRECHO ABERTO NÃO VALE MAIS QUE A HORA EM QUE COMEÇOU.
                //
                // Fechar na virada da hora limitava a FREQUÊNCIA (no máximo um
                // evento por hora), não a DURAÇÃO. O trecho em andamento sobrevive
                // à morte do app — mora no Prefs — então aparelho desligado, sem
                // rede, ou com o app morto por dois dias voltava e gravava UM
                // evento de dois dias.
                //
                // Medido em 09/08, em produção: 23 de 280 trechos de vitrine acima
                // de uma hora, o maior com 43,7 HORAS num aparelho que exibe vídeo
                // de 15 segundos. E o pior não é o número solto: ele entra no
                // relatório somado ao tempo real e ninguém desconfia, porque tempo
                // de vitrine alto é exatamente o que se espera de um ponto bom.
                //
                // O buraco é DESCARTADO, não distribuído. Partir as 43 horas em 43
                // eventos de uma hora seria inventar exibição que não houve: se o
                // aparelho estava desligado, ninguém viu nada. O que sobrevive é o
                // que dá para afirmar — a hora em que o trecho de fato começou.
                val fimDoTrecho = minOf(fronteira, inicioDaHora(atualDesde) + 3_600_000L)
                gravados += enfileirar(queue, tipoDe(atual), atual, atualDesde, fimDoTrecho)
                atualDesde = fronteira
            }
            Prefs.setSessaoAberta(ctx, atual, atualDesde)
        } else {
            Prefs.setSessaoAberta(ctx, null, 0L)
            ateOnde = agora
        }
        Prefs.setLastEventScan(ctx, ateOnde)
        return gravados
    }

    /**
     * O começo da hora em que este instante cai.
     *
     * Conta direta sobre o relógio universal, sem calendário: a época começa numa
     * hora cheia, então o resto da divisão por uma hora dá exatamente quanto já
     * passou dela. Fusos da América Latina são horas inteiras, então a fronteira
     * coincide com a hora local. Num fuso quebrado (30 ou 45 minutos) o corte
     * cairia no meio da hora local — e ainda assim o total fecha, porque quem
     * distribui o tempo pelas horas da loja é o servidor, a partir do início e do
     * fim reais de cada trecho.
     */
    private fun inicioDaHora(t: Long): Long = t - (t % 3_600_000L)

    /**
     * A vitrine tocando é dado, não ruído.
     *
     * Antes o próprio LINKA era descartado por ser "nosso app". Só que ele é a
     * metade que faltava da medição: sem o tempo de vídeo rodando, "o cliente
     * mexeu 2min08" não diz se o ponto é morto ou se converte.
     *
     * E é ele que fecha a visita com precisão — a vitrine voltar à tela É o
     * cliente ter ido embora, sem precisar estimar por tempo de silêncio.
     */
    private fun tipoDe(pkg: String): String =
        if (pkg == NOSSO_PACOTE) "showcase" else "app_usage"

    private fun enfileirar(
        queue: EventQueue,
        kind: String,
        pkg: String?,
        inicio: Long,
        fim: Long,
    ): Int {
        val segundos = (fim - inicio) / 1000
        if (segundos < MIN_SEGUNDOS) return 0
        // id determinístico: o mesmo intervalo lido duas vezes não duplica.
        val eventId = "$kind:${pkg ?: "tela"}:$inicio"
        queue.add(
            eventId, kind, pkg, iso.format(Date(inicio)), iso.format(Date(fim)), segundos,
        )
        return 1
    }
}
