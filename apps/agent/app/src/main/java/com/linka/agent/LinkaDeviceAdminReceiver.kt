package com.linka.agent

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

/**
 * O componente que recebe o cargo de "dono do aparelho".
 * Sem ele declarado no manifesto, `set-device-owner` não tem em quem investir.
 */
class LinkaDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        // Assumiu o cargo: aplica as travas na hora e reporta ao painel.
        Kiosk.applyPolicies(context)
        Telemetry.beatAsync(context)
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
