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
        val result = send(ctx, token, null) ?: return
        if (result.code !in 200..299) return

        val command = try {
            JSONObject(result.body).let { if (it.isNull("command")) null else it.optString("command") }
        } catch (_: Exception) {
            null
        }
        if (command.isNullOrEmpty()) return

        // Executa e confirma: o painel só limpa o comando quando o aparelho responde.
        if (execute(ctx, command)) send(ctx, token, command)
    }

    /** Confirmação imediata após trocar o que está na tela (não bloqueia a UI). */
    fun beatAsync(ctx: Context) {
        Thread { beat(ctx) }.start()
    }

    private fun execute(ctx: Context, command: String): Boolean = when (command) {
        "deprovision" -> Kiosk.deprovision(ctx)
        else -> false
    }

    private fun send(ctx: Context, token: String, commandDone: String?): Api.Result? {
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
        if (commandDone != null) body.put("command_done", commandDone)

        return try {
            Api.heartbeat(token, body)
        } catch (_: Exception) {
            // rede indisponível — o ciclo de 60s tenta de novo
            null
        }
    }
}
