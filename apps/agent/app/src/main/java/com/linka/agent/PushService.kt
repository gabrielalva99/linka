package com.linka.agent

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Recebe o "fale comigo agora" do servidor.
 *
 * O QUE CHEGA AQUI. Uma mensagem so, sempre igual, sem conteudo nenhum dentro.
 * Isso e de proposito: push e melhor esforco, e um push perdido nao pode deixar a
 * vitrine com campanha velha. Quem entrega de verdade continua sendo o heartbeat
 * — o push so antecipa a proxima batida.
 *
 * POR QUE ISSO IMPORTA. Enquanto comando so chegava pelo heartbeat, ele nao podia
 * ficar lento: "reiniciar a vitrine" levar cinco minutos com gente parada na loja
 * esperando e inaceitavel. Com o push entregando na hora, o heartbeat pode
 * espacar sem ninguem sentir — e e ele que responde por quase toda a conta de
 * chamadas que sobrou.
 */
class PushService : FirebaseMessagingService() {

    /**
     * O endereco do aparelho mudou (instalacao nova, restauracao, o FCM decidiu
     * rotacionar). Guarda e manda na proxima batida.
     *
     * Nao tenta enviar aqui na hora: este metodo roda em qualquer estado do
     * aparelho, inclusive sem rede logo apos o boot. Guardar e deixar o heartbeat
     * levar e o caminho que sobrevive a rede ruim de loja.
     */
    override fun onNewToken(token: String) {
        Prefs.setPushToken(this, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        if (message.data["acao"] != "falar_agora") return
        // Uma batida imediata resolve tudo: ela ja traz o comando pendente e o
        // aviso de conteudo novo. Nenhuma logica nova precisa existir aqui.
        falarAgora(this)
    }

    companion object {
        /**
         * Dois avisos colados viram uma conversa so.
         *
         * POR QUE. O FCM entrega "pelo menos uma vez" — mensagem repetida e
         * comportamento normal dele, nao defeito. E do lado do servidor uma unica
         * acao pode virar varios avisos: salvar campanha mexe na campanha, nos
         * videos e no alvo. O banco ja junta os avisos de uma mesma gravacao, mas
         * ele so enxerga o que passa por ele — repeticao do FCM e aviso vindo de
         * duas gravacoes seguidas escapam.
         *
         * COMO. Aviso que chega logo depois de uma conversa nao e jogado fora: ele
         * marca uma conversa para daqui a pouco. Nada se perde, e uma rajada vira
         * duas conversas em vez de dez.
         *
         * O ATRASO NAO CUSTA NADA NA PRATICA. Comando avulso chega sozinho, entao
         * cai no caminho imediato. So a rajada espera — e rajada e sempre alguem
         * mexendo no painel, nao alguem parado na loja esperando a tela virar.
         */
        private const val JANELA_MS = 5_000L

        private val relogio = Handler(Looper.getMainLooper())
        private val trava = Any()

        /** Nulo = ainda nao houve nenhuma; o primeiro aviso passa direto. */
        private var ultimaConversa: Long? = null
        private var jaMarcada = false

        fun falarAgora(service: PushService) {
            // O contexto da aplicacao, e nao o do servico: o Android encerra o
            // servico assim que esta funcao retorna, e daqui a cinco segundos ele
            // ja nao existe mais.
            val app = service.applicationContext
            val espera: Long
            synchronized(trava) {
                val agora = SystemClock.elapsedRealtime()
                val ultima = ultimaConversa
                if (ultima == null || agora - ultima >= JANELA_MS) {
                    ultimaConversa = agora
                    Telemetry.beatAsync(app)
                    return
                }
                if (jaMarcada) return
                jaMarcada = true
                espera = JANELA_MS - (agora - ultima)
            }
            relogio.postDelayed({
                synchronized(trava) {
                    jaMarcada = false
                    ultimaConversa = SystemClock.elapsedRealtime()
                }
                Telemetry.beatAsync(app)
            }, espera)
        }
    }
}
