package com.linka.agent

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.PowerManager
import android.os.SystemClock

/**
 * Sinais de saúde do aparelho — respondem "por que essa loja não está no ar?"
 * sem ninguém precisar ir até a loja. Tudo com API Android pura.
 */
object Health {

    /** Temperatura da bateria em °C (o sistema devolve em décimos). */
    fun temperatureC(ctx: Context): Double? {
        val intent: Intent? = ctx.registerReceiver(
            null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        )
        val tenths = intent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE)
        if (tenths == null || tenths == Int.MIN_VALUE) return null
        return tenths / 10.0
    }

    /** Segundos desde o último boot — reinício sozinho aparece como uptime baixo. */
    fun uptimeSeconds(): Long = SystemClock.elapsedRealtime() / 1000

    /** Tela acesa agora: vitrine apagada não é a mesma coisa que aparelho offline. */
    fun screenOn(ctx: Context): Boolean {
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isInteractive
    }

    /** wifi | cellular | ethernet | none */
    fun connection(ctx: Context): String {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return "none"
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
            else -> "none"
        }
    }

    /** Sinal do Wi-Fi em dBm (negativo). Só faz sentido quando a conexão é Wi-Fi. */
    @Suppress("DEPRECATION")
    fun signalDbm(ctx: Context): Int? {
        if (connection(ctx) != "wifi") return null
        val wm = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        val rssi = wm?.connectionInfo?.rssi ?: return null
        // Valor sentinela quando o sistema não quer informar.
        return if (rssi == Int.MIN_VALUE || rssi == 0) null else rssi
    }
}
