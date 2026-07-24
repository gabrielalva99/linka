package com.linka.agent

import android.content.Context
import android.os.BatteryManager
import android.os.Build

/** Reporta ao painel o estado atual do aparelho (bateria, versão, o que está na tela). */
object Telemetry {

    fun beat(ctx: Context) {
        val token = Prefs.token(ctx) ?: return
        val bm = ctx.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        try {
            Api.heartbeat(
                token,
                bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY),
                bm.isCharging,
                Build.VERSION.RELEASE,
                Prefs.playingUrl(ctx),
                Prefs.playingFit(ctx),
            )
        } catch (_: Exception) {
            // rede indisponível — o ciclo de 60s tenta de novo
        }
    }

    /** Confirmação imediata após trocar o que está na tela (não bloqueia a UI). */
    fun beatAsync(ctx: Context) {
        Thread { beat(ctx) }.start()
    }
}
