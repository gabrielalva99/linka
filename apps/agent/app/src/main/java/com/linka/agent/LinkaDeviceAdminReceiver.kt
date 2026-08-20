package com.linka.agent

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

/**
 * O componente que recebe o cargo de "dono do aparelho".
 * Sem ele declarado no manifesto, `set-device-owner` não tem em quem investir.
 */
class LinkaDeviceAdminReceiver : DeviceAdminReceiver() {

    /**
     * Assumiu o cargo — mas AINDA NÃO É DONO quando esta linha roda.
     *
     * ── O DEFEITO QUE ISTO CONSERTA (achado em 20/08) ─────────────────────
     * `set-device-owner` faz duas coisas, nesta ordem: (1) registra o
     * administrador, o que dispara ESTE método, e só depois (2) grava o cargo de
     * dono. Ou seja, quando chegamos aqui `isDeviceOwner` ainda responde FALSO —
     * e a primeira linha de `applyPolicies` é `if (!isDeviceOwner) return`.
     *
     * Resultado: este gancho NUNCA aplicou nada. Nunca apareceu porque o kit de
     * provisionamento reinicia o app logo depois, e aí é o `onCreate` que aplica
     * as travas. O gancho era decoração, e ninguém sabia.
     *
     * Apareceu ao provisionar o tablet Samsung com o app JÁ ABERTO: depois de
     * virar dono, `am force-stop` não mata mais o processo (o Android protege o
     * dono do aparelho), o app não reiniciou, e o aparelho ficou dono SEM
     * NENHUMA TRAVA — modo avião ligava normalmente. Num aparelho de loja isso é
     * uma vitrine que parece protegida e não está.
     *
     * ── O CONSERTO ────────────────────────────────────────────────────────
     * Esperar o cargo chegar, em vez de desistir na primeira tentativa. São
     * milissegundos na prática; o teto de 10 segundos existe só para não deixar
     * uma linha de execução pendurada se algo der errado de verdade.
     *
     * `goAsync` segura o processo vivo durante a espera: sem ele o Android pode
     * encerrar o receptor assim que este método retorna, e a espera morreria
     * junto.
     */
    override fun onEnabled(context: Context, intent: Intent) {
        val segurando = goAsync()
        Thread {
            try {
                val ate = System.currentTimeMillis() + 10_000L
                while (System.currentTimeMillis() < ate && !Kiosk.isDeviceOwner(context)) {
                    try { Thread.sleep(200) } catch (_: InterruptedException) { break }
                }
                // Aplica de qualquer forma na saída: se o cargo chegou, as travas
                // entram; se não chegou, `applyPolicies` volta sozinha na primeira
                // linha e nada quebra.
                Kiosk.applyPolicies(context)
                Telemetry.beatAsync(context)
            } finally {
                segurando.finish()
            }
        }.start()
    }

    override fun onDisabled(context: Context, intent: Intent) {
        Telemetry.beatAsync(context)
    }

    /**
     * O aparelho acabou de ser provisionado pelo QR. Aqui chega o codigo da loja
     * que foi impresso dentro dele.
     *
     * POR QUE ISTO IMPORTA PARA QUEM INSTALA. Sem o codigo, alguem tem que
     * digitar na tela do aparelho o identificador da loja. Foi assim ate agora, e
     * em campo isso significa: promotor lendo um codigo de um papel, digitando
     * errado, e o aparelho entrando vinculado a loja de outra cidade — erro que so
     * aparece dias depois, quando o relatorio nao fecha.
     *
     * Vindo no QR, o aparelho ja nasce na loja certa e ninguem digita nada.
     */
    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        val extras = intent.getParcelableExtra<android.os.PersistableBundle>(
            android.app.admin.DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE,
        )
        val codigo = extras?.getString("codigo")?.trim()?.uppercase()
        if (!codigo.isNullOrEmpty()) Prefs.setCodigoDoQr(context, codigo)

        // As travas entram agora: e o unico momento garantido em que somos dono do
        // aparelho e ninguem mexeu em nada ainda.
        Kiosk.applyPolicies(context)

        // Abre a vitrine sozinha. O promotor le o QR e nao toca em mais nada — se
        // ele precisasse achar o app na gaveta, o passo a passo ganharia um item
        // e a chance de ele parar no meio.
        context.startActivity(
            Intent(context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
