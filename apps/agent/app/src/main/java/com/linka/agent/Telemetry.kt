package com.linka.agent

import android.content.Context
import android.os.BatteryManager
import android.os.Build
import org.json.JSONObject

/**
 * Reporta ao painel o estado atual do aparelho e executa comandos que voltam na
 * resposta. O canal é o próprio heartbeat: um caminho só, sem conexão persistente
 * (que no Android é caro em bateria).
 */
object Telemetry {

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
        // Entregue: pode esquecer o relato da faxina.
        Prefs.setPendingCleanupReport(ctx, null)
        // Idem para a saída de manutenção: só esquece com confirmação do servidor.
        Prefs.setSaidaPendente(ctx, null)

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
            if (Kiosk.deprovision(ctx)) "controle devolvido" else "falhou: não era dono"
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
            } else null
    }

    private fun send(
        ctx: Context,
        token: String,
        commandDone: String? = null,
        commandResult: String? = null,
    ): Api.Result? {
        val bm = ctx.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val body = JSONObject()
            .put("status", "online")
            // Modo REAL: só é "demonstração" se houver vídeo rodando de fato.
            .put("mode", Prefs.mode(ctx))
            .put("battery_level", bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY))
            .put("battery_charging", bm.isCharging)
            .put("os_version", Build.VERSION.RELEASE)
            .put("playing_url", Prefs.playingUrl(ctx) ?: JSONObject.NULL)
            .put("playing_fit", Prefs.playingFit(ctx) ?: JSONObject.NULL)
            // Campanha inteira já no aparelho: exibição não depende mais da rede.
            .put("synced", Prefs.synced(ctx))
            // A revisao do conteudo aplicado: e com ela que o servidor responde
            // se este aparelho ainda esta em dia.
            .put("revisao", Prefs.revisao(ctx) ?: JSONObject.NULL)
            // Saúde: explica queda de loja sem visita técnica.
            .put("temperature_c", Health.temperatureC(ctx) ?: JSONObject.NULL)
            .put("uptime_seconds", Health.uptimeSeconds())
            .put("screen_on", Health.screenOn(ctx))
            .put("connection", Health.connection(ctx))
            .put("signal_dbm", Health.signalDbm(ctx) ?: JSONObject.NULL)
            // Kiosk: o painel nunca deve adivinhar se a trava pegou.
            .put("is_device_owner", Kiosk.isDeviceOwner(ctx))
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
        // Identidade que sobrevive a restauracao de fabrica, e DE ONDE ela veio.
        //
        // Vai no heartbeat, e nao so no provisionamento, porque os aparelhos que ja
        // estao na rua nunca vao reprovisionar — eles aprendem aqui. Sem isso, a
        // correcao so valeria para aparelho novo, e o fantasma continuaria possivel
        // justamente na frota que ja existe.
        val identidade = Identidade.estavel(ctx)
        body.put("stable_id", identidade.valor)
        body.put("stable_id_source", identidade.fonte)
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
        // Saída de manutenção que aconteceu na loja: sobe na primeira batida que
        // pegar rede. Só limpa depois de o servidor confirmar (abaixo), senão uma
        // queda de rede apagaria o registro justamente de quem destravou offline.
        Prefs.saidaPendente(ctx)?.let { body.put("maintenance_exit", it) }

        return try {
            Api.heartbeat(token, body)
        } catch (_: Exception) {
            // rede indisponível — o ciclo de 60s tenta de novo
            null
        }
    }
}
