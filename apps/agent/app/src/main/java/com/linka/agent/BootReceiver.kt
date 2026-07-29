package com.linka.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Sobe a vitrine sozinha quando o aparelho liga.
 *
 * Isto faltava e o buraco era grande: o retorno depois de reiniciar vinha só do
 * cargo de DONO DO APARELHO, e a frota de instalação assistida não tem esse
 * cargo. A loja tirava da tomada, o Android reiniciava de madrugada, e a vitrine
 * ficava preta até alguém abrir o app à mão.
 *
 * ── O que deu errado na primeira versão ─────────────────────────────────────
 * Ela ouvia LOCKED_BOOT_COMPLETED e se declarava directBootAware, ou seja,
 * rodava ANTES de o aparelho destravar. Nessa fase a memória do app ainda não
 * está montada: ler o token estourava, o processo morria, e como o LINKA é a
 * TELA INICIAL destes aparelhos, o sistema ficava esperando uma tela que nunca
 * subia. Dois aparelhos de teste passaram minutos presos na inicialização,
 * enquanto um aparelho sem o LINKA reiniciou em segundos.
 *
 * A lição que fica no código: num aparelho onde somos a tela inicial, qualquer
 * erro nosso durante o boot não é um app que quebra — é um aparelho que não liga.
 * Por isso agora tudo aqui é à prova de exceção, sem exceção.
 *
 * ── Atualizar o app também mata a vitrine (achado do Gabriel) ────────────────
 * Instalar uma versão nova mata o processo, e o Android NÃO o levanta de volta.
 * Isso ficava escondido porque a vitrine costuma ser a tela inicial e estar na
 * frente: matando o processo, o sistema pede a tela inicial de novo e ela volta
 * por acidente.
 *
 * O acidente falha exatamente quando mais custa. Depois de uma saída de
 * manutenção — ou com o cliente na câmera, que é o caso comum na loja — quem
 * está na frente é o launcher da Motorola. A atualização entra, o LINKA morre, e
 * o Android levanta o launcher, não a gente. A vitrine fica morta até alguém
 * reiniciar o aparelho, e o painel não acusa nada porque o aparelho simplesmente
 * para de aparecer.
 *
 * Em 250 aparelhos que se atualizam sozinhos, isso é uma loja apagada por
 * atualização. MY_PACKAGE_REPLACED é o aviso de "acabei de ser substituído", e é
 * o unico momento em que dá para reagir.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        // Nada aqui pode escapar. Exceção em receptor de boot derruba o processo
        // que o sistema está esperando para terminar de ligar o aparelho.
        try {
            val acao = intent.action ?: return
            if (acao != Intent.ACTION_BOOT_COMPLETED &&
                acao != "android.intent.action.QUICKBOOT_POWERON" &&
                acao != Intent.ACTION_MY_PACKAGE_REPLACED
            ) {
                return
            }
            // Aparelho que nunca entrou na frota não tem o que exibir: subir a
            // tela de pareamento sozinha na prateleira só assusta quem passa.
            val token = try {
                Prefs.token(context)
            } catch (_: Exception) {
                null
            }
            if (token == null) return

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
        } catch (_: Throwable) {
            // Ver o comentário do topo: aqui, falhar em silêncio é melhor do que
            // deixar o aparelho sem ligar.
        }
    }
}
