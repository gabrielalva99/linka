package com.linka.agent

import android.content.Context
import android.os.BatteryManager
import android.os.Build
import android.os.SystemClock
import org.json.JSONObject

/**
 * Reporta ao painel o estado atual do aparelho e executa comandos que voltam na
 * resposta. O canal é o próprio heartbeat: um caminho só, sem conexão persistente
 * (que no Android é caro em bateria).
 */
object Telemetry {

    /**
     * Quando o aparelho falou com o servidor pela ultima vez, por qualquer
     * motivo. Vale para o processo — reiniciou, fala de novo na hora, que e o
     * comportamento certo depois de um susto.
     *
     * NULO, e nao zero. O relogio do Android conta desde que o aparelho ligou,
     * entao logo apos um reinicio ele vale poucos segundos — e "poucos segundos
     * menos zero" da menos que o intervalo, o que faria a PRIMEIRA batida depois
     * do reinicio ser pulada. Com 5 minutos de intervalo, um aparelho que acabou
     * de voltar ficaria mudo por cinco minutos, aparecendo como fora do ar
     * justamente na hora em que alguem esta olhando para ele.
     */
    private var ultimaConversa: Long? = null

    /**
     * A batida do relogio, que so acontece se ninguem falou antes.
     *
     * POR QUE ELA MUDOU. Enquanto a batida era o caminho de tudo — comando,
     * conteudo, "estou aqui" — ela nao podia ficar lenta: reiniciar a vitrine
     * levar cinco minutos com gente esperando na loja e inaceitavel. Com o push
     * entregando comando e conteudo em segundos, sobrou para ela um papel so:
     * "esta loja esta no ar?". Esse aguenta ser lento, e e ele que responde por
     * quase toda a conta de chamadas da frota.
     *
     * QUALQUER conversa conta, e nao so esta. Um push acabou de chegar, o video
     * trocou, a faxina reportou: o servidor ja sabe que este aparelho esta vivo, e
     * repetir a informacao 20 segundos depois e chamada jogada fora. Por isso o
     * relogio zera em `send`, e nao aqui.
     *
     * O RITMO VEM DO PAINEL. Sem isso, descobrir que 5 minutos e demais custaria
     * uma versao nova e uma volta na frota inteira. A cadencia real e multipla de
     * 60s, que e o passo do relogio do servico — 300s da exatamente 5 minutos.
     *
     * QUEM MANDA NO GASTO E O MENOR ENTRE ESTE RITMO E O RODIZIO DA CAMPANHA.
     * Trocar de video reporta o que entrou na tela (e disso vive o "o que esta
     * tocando" do painel, e o aviso de tela vazia), entao uma campanha que gira
     * de 3 em 3 minutos fala de 3 em 3, por mais lento que este numero esteja.
     * Medido: com rodizio de 180s, um aparelho no ritmo de 5 min batia a cada
     * ~3 min. Nao e defeito — e o preco de saber o que esta na tela. So importa
     * na hora de estimar a conta: quem decide e min(rodizio, ritmo), e o padrao
     * de rodizio do painel e 20 minutos, entao na operacao real quem manda e
     * este numero aqui.
     */
    fun batidaPeriodica(ctx: Context) {
        val ultima = ultimaConversa
        val intervalo = Prefs.heartbeatSeconds(ctx) * 1000L
        if (ultima != null && SystemClock.elapsedRealtime() - ultima < intervalo) return
        beat(ctx)
    }

    fun beat(ctx: Context) {
        val token = Prefs.token(ctx) ?: return
        val result = send(ctx, token) ?: return

        // 401 nao e "sem rede": e o servidor dizendo que este token nao vale mais.
        //
        // Cinco recusas seguidas (cinco minutos) e o aparelho esquece o token e
        // volta para o pareamento, onde o kit ou o tecnico resolvem. Cinco, e nao
        // uma, porque um 401 isolado por um deploy no meio da batida nao pode
        // custar a credencial de um aparelho que estava bem.
        if (result.code == 401) {
            val vezes = Prefs.contarRecusaDeToken(ctx)
            if (vezes >= 5) Prefs.esquecerToken(ctx)
            return
        }
        if (result.code !in 200..299) return
        // Deu certo: zera o contador, senao recusas espalhadas por semanas
        // acabariam somando cinco e derrubariam um aparelho saudavel.
        if (Prefs.recusasDeToken(ctx) > 0) Prefs.limparRecusasDeToken(ctx)

        // PRIMEIRO CONTATO: agora as travas de rede podem entrar.
        //
        // Antes elas entravam junto com o cargo de dono, e num aparelho ainda sem
        // wi-fi isso o trancava fora da rede para sempre. Aqui ja existe rede
        // provada — o servidor respondeu.
        if (!Prefs.jaFalouComServidor(ctx)) {
            Prefs.marcarQueFalouComServidor(ctx)
            Kiosk.applyPolicies(ctx)
        }

        // REDE NOVA PROVADA: agora — e so agora — o wi-fi pode trancar de novo.
        //
        // O tecnico trocou a rede na manutencao e as travas ficaram soltas. Este e
        // o unico ponto do app que sabe que a rede nova FUNCIONA, porque acabou de
        // receber resposta do servidor por ela.
        //
        // Trancar pelo fim do relogio da manutencao seria o caminho obvio e estaria
        // errado: se o tecnico digitou a senha errada, o relogio vence do mesmo
        // jeito e o aparelho se tranca fora da rede — o defeito que ja custou uma
        // restauracao de fabrica. Aqui, rede ruim simplesmente nao chega neste
        // ponto, e o aparelho fica destravado esperando alguem tentar de novo.
        if (Prefs.redeLiberada(ctx) && !Prefs.emManutencao(ctx)) {
            Kiosk.retrancarRede(ctx)
        }
        // Entregue: pode esquecer o relato da faxina.
        Prefs.setPendingCleanupReport(ctx, null)
        // Idem para a saída de manutenção: só esquece com confirmação do servidor.
        Prefs.setSaidaPendente(ctx, null)
        // E quem retirou o aparelho para venda. É por esta linha que a tela sabe
        // que pode seguir: pendência limpa quer dizer registro no servidor.
        Prefs.setRetiradaPendente(ctx, null)
        // E as quedas: apagar ao enviar perderia o relato numa falha de rede, que
        // é justamente o que costuma acompanhar aparelho com problema.
        CrashLog.limpar(ctx)

        val resposta = try { JSONObject(result.body) } catch (_: Exception) { null }

        // O SERVIDOR AVISOU QUE MUDOU. Este e o canal que substituiu a pergunta
        // sem parar por conteudo: a batida ja acontece de qualquer jeito, entao a
        // novidade pega carona nela e custa ZERO chamada a mais. A vitrine busca
        // na proxima volta do relogio dela — quem aplica conteudo continua sendo
        // um lugar so, a tela.
        if (resposta?.optBoolean("conteudo_mudou") == true) {
            Prefs.setNovidadePendente(ctx, true)
        }

        val command = try {
            resposta?.let { if (it.isNull("command")) null else it.optString("command") }
        } catch (_: Exception) {
            null
        }
        if (command.isNullOrEmpty()) return

        // Executa e confirma: o painel só limpa o comando quando o aparelho responde.
        val report = execute(ctx, command)
        if (report != null) send(ctx, token, command, report)
    }

    /** Confirmação imediata após trocar o que está na tela (não bloqueia a UI). */
    fun beatAsync(ctx: Context) {
        Thread { beat(ctx) }.start()
    }

    /** Devolve o relato do comando, ou null se não soubermos executá-lo. */
    private fun execute(ctx: Context, command: String): String? = when (command) {
        "deprovision" ->
            Kiosk.deprovision(ctx)
        "debug_probe" -> Kiosk.probeDebug(ctx)
        "debug_off" ->
            if (Kiosk.setAdbEnabled(ctx, false)) "depuração desligada" else "recusado"
        "debug_on" ->
            if (Kiosk.setAdbEnabled(ctx, true)) "depuração ligada" else "recusado"
        "cleanup_now" -> Cleanup.run(ctx).also { Prefs.setPendingCleanupReport(ctx, it) }
        "lock_probe" -> Kiosk.probeLock(ctx)
        "clear_password" -> Kiosk.clearScreenLock(ctx)
        // Aparelho que desistiu de uma atualização só voltava com cabo: o
        // contador de tentativas é por versão e nada no painel o zerava. Com 250
        // na rua, isso é um técnico dirigindo até a loja porque um download
        // falhou três vezes.
        // REINICIAR O APLICATIVO. Existe porque estado em memoria pode segurar o
        // aparelho de um jeito que nenhum outro comando alcanca — a flag de "ja
        // estou baixando" deixou dois aparelhos uma hora atras da frota em
        // 19/08, calados. Aquele caso se resolveu sozinho, mas so porque havia
        // uma rede de seguranca de 30 minutos por perto; o proximo pode nao ter.
        //
        // Agenda a volta ANTES de morrer: com o quiosque ligado o Android
        // costuma restaurar a tarefa sozinho, mas o alarme cobre o caso em que
        // ele nao restaura, e uma vitrine apagada e pior que o problema original.
        "restart_app" -> {
            val intent = android.content.Intent(ctx, MainActivity::class.java)
                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            val pi = android.app.PendingIntent.getActivity(
                ctx, 1, intent,
                android.app.PendingIntent.FLAG_ONE_SHOT or android.app.PendingIntent.FLAG_IMMUTABLE,
            )
            try {
                (ctx.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager)
                    .set(android.app.AlarmManager.RTC, System.currentTimeMillis() + 2_000, pi)
            } catch (_: Exception) {
            }
            // Morre DEPOIS de a resposta subir: matar agora perderia o relato, e
            // o painel ficaria sem saber se o comando chegou a rodar.
            Thread {
                try { Thread.sleep(6_000) } catch (_: InterruptedException) {}
                kotlin.system.exitProcess(0)
            }.start()
            "reiniciando o aplicativo"
        }
        "update_retry" -> {
            Prefs.clearUpdateFailure(ctx)
            "vai tentar atualizar de novo"
        }
        "inventory_now" -> {
            // Força o envio do inventário na próxima batida, em vez de esperar a hora.
            Prefs.setLastInventoryAt(ctx, 0L)
            "inventário será enviado agora"
        }
        else ->
            // Comando com alvo: "uninstall:com.exemplo.jogo".
            if (command.startsWith("uninstall:")) {
                val pacote = command.removePrefix("uninstall:")
                Prefs.setLastInventoryAt(ctx, 0L)
                Inventory.desinstalar(ctx, pacote)
            } else if (command.startsWith("wifi:")) {
                // Carga em JSON, e não separada por dois-pontos: nome de rede e
                // senha de loja têm dois-pontos, espaço e acento à vontade, e um
                // separador ingênuo quebraria justamente na rede de nome difícil.
                try {
                    val o = JSONObject(command.removePrefix("wifi:"))
                    Kiosk.adicionarRede(ctx, o.optString("ssid"), o.optString("pass"))
                } catch (_: Exception) {
                    "falhou: não entendi os dados da rede"
                }
            } else null
    }

    private fun send(
        ctx: Context,
        token: String,
        commandDone: String? = null,
        commandResult: String? = null,
    ): Api.Result? {
        // O relogio da batida periodica zera AQUI, e nao no fim: assim toda
        // conversa conta, inclusive as que nasceram de um push ou de uma troca de
        // video. Marcar na tentativa, e nao no sucesso, tambem evita o aparelho
        // insistir sem parar quando a rede da loja cai.
        ultimaConversa = SystemClock.elapsedRealtime()
        val bm = ctx.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val body = JSONObject()
            .put("status", "online")
            // Modo REAL: só é "demonstração" se houver vídeo rodando de fato.
            .put("mode", Prefs.mode(ctx))
            .put("battery_level", bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY))
            .put("battery_charging", bm.isCharging)
            .put("os_version", Build.VERSION.RELEASE)
            // Memoria do proprio aplicativo: usado, teto e nativa. O teto vai
            // junto porque "180 MB" nao diz nada sozinho, e diz tudo ao lado de
            // "de 192". Ver o comentario em Health.memoriaMb.
            .also { corpo ->
                val (usado, teto, nativo) = Health.memoriaMb()
                corpo.put("heap_usado_mb", usado)
                    .put("heap_teto_mb", teto)
                    .put("heap_nativo_mb", nativo)
            }
            .put("playing_url", Prefs.playingUrl(ctx) ?: JSONObject.NULL)
            .put("playing_fit", Prefs.playingFit(ctx) ?: JSONObject.NULL)
            // Campanha inteira já no aparelho: exibição não depende mais da rede.
            .put("synced", Prefs.synced(ctx))
            // A revisao do conteudo aplicado: e com ela que o servidor responde
            // se este aparelho ainda esta em dia.
            .put("revisao", Prefs.revisao(ctx) ?: JSONObject.NULL)
            // Endereco no FCM: vai em toda batida, e nao uma vez so. Se o
            // servidor perder (repareamento, restauracao do banco), a proxima
            // batida devolve — atalho que so se registra uma vez some em silencio.
            .put("push_token", Prefs.pushToken(ctx) ?: JSONObject.NULL)
            // Saúde: explica queda de loja sem visita técnica.
            .put("temperature_c", Health.temperatureC(ctx) ?: JSONObject.NULL)
            .put("uptime_seconds", Health.uptimeSeconds())
            // Ha quanto tempo o PROCESSO esta vivo. Vai ao lado do uptime de
            // proposito: e a diferenca entre os dois que diz se o aplicativo
            // morreu e voltou sem o aparelho ter reiniciado.
            .put("processo_segundos", Health.processoSegundos())
            .put("screen_on", Health.screenOn(ctx))
            .put("connection", Health.connection(ctx))
            .put("signal_dbm", Health.signalDbm(ctx) ?: JSONObject.NULL)
            // Kiosk: o painel nunca deve adivinhar se a trava pegou.
            .put("is_device_owner", Kiosk.isDeviceOwner(ctx))
            // CONSIGO ME ATUALIZAR SOZINHO? Existe para a TV, que nunca vira dona
            // do aparelho e depende do appop de instalação. Se a preparação do box
            // falhar, ele congela na versão e NADA avisa: sem erro, sem queda, só
            // uma loja velha. Com este campo o painel abre "não atualiza" e a falha
            // silenciosa vira visita marcada.
            .put(
                "pode_atualizar_sozinho",
                Kiosk.isDeviceOwner(ctx) || SelfUpdate.podeInstalarEmSilencio(ctx),
            )
            // Tres fatos diferentes, e o nome de cada um diz o que ele mede.
            // "kiosk_locked" nunca foi a trava do quiosque: sao as travas de REDE.
            // Elas ficam aplicadas durante a manutencao, entao sozinhas diziam ao
            // painel que a vitrine estava presa justamente quando ela nao estava.
            .put("kiosk_locked", Kiosk.locked(ctx))
            .put("lock_task_on", Kiosk.lockTaskOn(ctx))
            .put("maintenance_open", Prefs.emManutencao(ctx))
            .put("adb_enabled", Kiosk.adbEnabled(ctx))
            // O painel precisa saber se a cura está disponível ANTES de precisar dela.
            .put("reset_token_ready", Kiosk.resetTokenActive(ctx))
            // Senha de tela: não dá para apagar neste hardware, mas o painel
            // tem que saber antes de o aparelho ir para a prateleira.
            .put("screen_lock_set", Kiosk.screenLockSet(ctx))
            .put("blocked_apps", Kiosk.blockedApps(ctx))
            // O estado REAL de cada trava, perguntado ao Android nesta batida.
            // O painel deixa de deduzir proteção a partir do interruptor que o
            // operador ligou — que diz o que se pediu, nunca o que se conseguiu.
            .put("protecoes", Kiosk.protecoes(ctx))
        // Identidade que sobrevive a restauracao de fabrica, e DE ONDE ela veio.
        //
        // Vai no heartbeat, e nao so no provisionamento, porque os aparelhos que ja
        // estao na rua nunca vao reprovisionar — eles aprendem aqui. Sem isso, a
        // correcao so valeria para aparelho novo, e o fantasma continuaria possivel
        // justamente na frota que ja existe.
        val identidade = Identidade.estavel(ctx)
        body.put("stable_id", identidade.valor)
        body.put("stable_id_source", identidade.fonte)
        // A TELA DE AGORA, e é ela que decide qual versão da peça este aparelho
        // recebe. Em dobrável muda quando o aparelho abre, então vai em toda
        // batida — medir uma vez no provisionamento estaria errado metade do
        // tempo, e ninguém saberia qual metade.
        // QUEM MEDIU FOI A VITRINE, e a batida só repete.
        //
        // Medir aqui daria a tela errada: a batida periódica sai do SERVIÇO, e
        // serviço não está preso a display nenhum. Num dobrável o Android
        // devolve a tela padrão, que pode ser a externa mesmo com o aparelho
        // aberto. Foi o que fez o razr da Interlagos reportar 1080x1272 (tela
        // externa) enquanto exibia na interna, recebendo criativo de outro
        // formato o dia inteiro. Ver Prefs.telaDaVitrine.
        //
        // A medida direta continua como reserva, para o caso de a batida sair
        // antes de a vitrine ter aberto uma vez.
        (Prefs.telaDaVitrine(ctx) ?: Health.tela(ctx))?.let { (w, h) ->
            body.put("screen_width", w)
            body.put("screen_height", h)
        }
        // AS QUEDAS PEGAM CARONA NA BATIDA.
        //
        // Sem canal próprio de propósito: a batida já vai e volta, então relatar
        // uma queda custa zero chamada a mais — e um aparelho que acabou de
        // travar é o último lugar de onde se quer abrir mais conexão. Vão só
        // quando existem.
        CrashLog.pendentes(ctx)?.let { body.put("quedas", it) }
        // "Está atualizado?" não é mais respondido aqui. O aparelho só sabia a
        // versão publicada por um valor em cache, então respondia com atraso e o
        // painel contava errado. Quem compara agora é o servidor, que tem as duas
        // pontas: a versão instalada e a publicada.
        // Inventário de apps a cada hora, não a cada minuto: a lista muda pouco e
        // são dezenas de itens. O que precisa ser rápido é bateria e status.
        val agora = System.currentTimeMillis()
        if (agora - Prefs.lastInventoryAt(ctx) > 3_600_000) {
            body.put("apps", Inventory.json(ctx))
            Prefs.setLastInventoryAt(ctx, agora)
        }
        if (commandDone != null) body.put("command_done", commandDone)
        if (commandResult != null) body.put("command_result", commandResult)
        // Faxina que rodou sozinha precisa aparecer no painel na mesma batida.
        Prefs.pendingCleanupReport(ctx)?.let { body.put("cleanup_result", it) }
        // Aparelho que desistiu de atualizar não pode ficar em silêncio.
        body.put("update_error", Prefs.updateError(ctx) ?: JSONObject.NULL)
        body.put("update_state", Prefs.updateState(ctx) ?: JSONObject.NULL)
        // ONDE ESTA A TELA DE RAM NESTE APARELHO. Vai para o painel porque de
        // fora nao da para descobrir: a tela nao tem icone, entao nao aparece no
        // inventario. Sem isto, "o botao nao apareceu no Moto G" so se
        // investigava com o aparelho na mao — e ele esta na loja.
        Prefs.telaDeRam(ctx)?.let { body.put("tela_de_ram", it) }
        // Manda SEMPRE, inclusive vazio: e assim que o painel sabe que o problema
        // passou. Mandar so quando existe faria o alerta antigo ficar preso no
        // servidor mesmo depois de o aparelho voltar ao normal.
        body.put("erro_de_video", Prefs.ultimoErroDeVideo(ctx) ?: JSONObject.NULL)
        // Saída de manutenção que aconteceu na loja: sobe na primeira batida que
        // pegar rede. Só limpa depois de o servidor confirmar (abaixo), senão uma
        // queda de rede apagaria o registro justamente de quem destravou offline.
        Prefs.saidaPendente(ctx)?.let { body.put("maintenance_exit", it) }
        Prefs.retiradaPendente(ctx)?.let {
            body.put("retirada", try { JSONObject(it) } catch (_: Exception) { JSONObject() })
        }

        return try {
            Api.heartbeat(token, body)
        } catch (_: Exception) {
            // rede indisponível — o ciclo de 60s tenta de novo
            null
        }
    }
}
