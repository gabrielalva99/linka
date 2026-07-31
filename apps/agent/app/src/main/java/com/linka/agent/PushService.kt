package com.linka.agent

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
        Telemetry.beatAsync(this)
    }
}
