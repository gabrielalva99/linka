package com.linka.agent

import android.content.Context
import android.os.BatteryManager
import android.os.Build
import org.json.JSONObject

/** Reporta ao painel o estado atual do aparelho (bateria, versão, o que está na tela). */
object Telemetry {

    fun beat(ctx: Context) {
        val token = Prefs.token(ctx) ?: return
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
        try {
            Api.heartbeat(token, body)
        } catch (_: Exception) {
            // rede indisponível — o ciclo de 60s tenta de novo
        }
    }

    /** Confirmação imediata após trocar o que está na tela (não bloqueia a UI). */
    fun beatAsync(ctx: Context) {
        Thread { beat(ctx) }.start()
    }
}
