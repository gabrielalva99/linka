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
        if (result.code !in 200..299) return
        // Entregue: pode esquecer o relato da faxina.
        Prefs.setPendingCleanupReport(ctx, null)

        val command = try {
            JSONObject(result.body).let { if (it.isNull("command")) null else it.optString("command") }
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
        else -> null
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
            // Saúde: explica queda de loja sem visita técnica.
            .put("temperature_c", Health.temperatureC(ctx) ?: JSONObject.NULL)
            .put("uptime_seconds", Health.uptimeSeconds())
            .put("screen_on", Health.screenOn(ctx))
            .put("connection", Health.connection(ctx))
            .put("signal_dbm", Health.signalDbm(ctx) ?: JSONObject.NULL)
            // Kiosk: o painel nunca deve adivinhar se a trava pegou.
            .put("is_device_owner", Kiosk.isDeviceOwner(ctx))
            .put("kiosk_locked", Kiosk.locked(ctx))
            .put("adb_enabled", Kiosk.adbEnabled(ctx))
            // O painel precisa saber se a cura está disponível ANTES de precisar dela.
            .put("reset_token_ready", Kiosk.resetTokenActive(ctx))
            .put("blocked_apps", Kiosk.blockedApps(ctx))
        // Atualizado = a versão que está rodando é a publicada. Quem sabe as duas
        // pontas é o aparelho, então é ele que responde.
        Prefs.publishedVersion(ctx)?.let {
            body.put("app_updated", it == Api.AGENT_VERSION)
        }
        if (commandDone != null) body.put("command_done", commandDone)
        if (commandResult != null) body.put("command_result", commandResult)
        // Faxina que rodou sozinha precisa aparecer no painel na mesma batida.
        Prefs.pendingCleanupReport(ctx)?.let { body.put("cleanup_result", it) }
        // Aparelho que desistiu de atualizar não pode ficar em silêncio.
        body.put("update_error", Prefs.updateError(ctx) ?: JSONObject.NULL)

        return try {
            Api.heartbeat(token, body)
        } catch (_: Exception) {
            // rede indisponível — o ciclo de 60s tenta de novo
            null
        }
    }
}
