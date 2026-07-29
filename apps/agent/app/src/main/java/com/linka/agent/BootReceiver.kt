package com.linka.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Sobe a vitrine sozinha quando o aparelho liga.
 *
 * Isto faltava e o buraco era grande. O retorno automático depois de reiniciar
 * vinha só do cargo de DONO DO APARELHO, que marca o LINKA como tela inicial —
 * e a frota da Motorola é justamente a de instalação assistida, sem esse cargo.
 * Resultado: a loja tirava o aparelho da tomada, o Android reiniciava de
 * madrugada, e a vitrine ficava preta até alguém abrir o app à mão. Uma loja
 * inteira podia passar o fim de semana morta sem ninguém saber.
 *
 * Sobe o serviço primeiro e a tela depois: o serviço é quem reporta ao painel,
 * e ele precisa estar de pé mesmo que abrir a tela falhe.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val acao = intent.action ?: return
        if (acao != Intent.ACTION_BOOT_COMPLETED &&
            acao != Intent.ACTION_LOCKED_BOOT_COMPLETED &&
            acao != "android.intent.action.QUICKBOOT_POWERON"
        ) {
            return
        }
        // Aparelho que nunca entrou na frota não tem o que exibir: subir a tela
        // de pareamento sozinha na prateleira só assusta quem passa.
        if (Prefs.token(context) == null) return

        try {
            context.startForegroundService(Intent(context, HeartbeatService::class.java))
        } catch (_: Exception) {
            // Sem permissão de serviço em segundo plano logo após o boot: o
            // ciclo normal do app assume quando a tela subir.
        }
        try {
            context.startActivity(
                Intent(context, MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        } catch (_: Exception) {
            // Sem permissão de abrir em segundo plano: o provisionamento concede.
        }
    }
}
