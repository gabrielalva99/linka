package com.linka.agent

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.view.WindowManager

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

    /**
     * O TAMANHO DA TELA ONDE A VITRINE APARECE, agora.
     *
     * É o que permite ao servidor escolher, entre as versões de uma peça, o
     * arquivo feito para este formato. Sem isto, o servidor cai na resolução
     * cadastrada no modelo — que acerta o aparelho comum e erra o dobrável.
     *
     * POR QUE VAI EM TODA BATIDA, e não uma vez no provisionamento: no Razr a
     * tela MUDA quando o aparelho abre. Medido no pack real, um criativo da tela
     * externa (1080x1272, quase quadrado) exibido na interna (1224x2992) precisa
     * ampliar tanto para preencher a altura que corta as laterais inteiras — a
     * peça fica ilegível. Um valor medido uma vez só estaria errado metade do
     * tempo, e ninguém saberia qual metade.
     *
     * É A TELA FÍSICA, e não a área do aplicativo. Medido no Razr em 08/08: por
     * `displayMetrics` o aparelho reportava 1224x2790 — 202 pixels a menos, que
     * são as barras de sistema. A agência corta o criativo para a tela do
     * aparelho (1224x2992), então a diferença fazia o servidor não encontrar o
     * arquivo exato e cair no mais parecido: entregava 1080x2520 a um aparelho
     * que tinha peça feita sob medida. O quiosque ocupa a tela inteira de
     * qualquer forma, então a área máxima é a que descreve o que o cliente vê.
     */
    fun tela(ctx: Context): Pair<Int, Int>? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
            val b = wm?.maximumWindowMetrics?.bounds
            if (b != null && b.width() > 0 && b.height() > 0) {
                return b.width() to b.height()
            }
        }
        // Reserva para Android 10 e anterior: a área do aplicativo. Erra pelas
        // barras, mas a proporção continua próxima o bastante para a escolha por
        // formato funcionar — e é melhor que não reportar nada.
        @Suppress("DEPRECATION")
        val dm = ctx.resources?.displayMetrics ?: return null
        val w = dm.widthPixels
        val h = dm.heightPixels
        return if (w > 0 && h > 0) w to h else null
    }
}
