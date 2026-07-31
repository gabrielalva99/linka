package com.linka.agent

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Build
import android.os.Bundle

/**
 * O aperto de mao com o assistente de configuracao do Android, no fluxo do QR.
 *
 * O QUE ELA RESOLVE. A partir do Android 10 o sistema nao decide sozinho que tipo
 * de gestao o app quer: ele PERGUNTA, e quem nao responde tem o provisionamento
 * cancelado no meio — o promotor le o QR, ve uma tela de erro e nao tem como
 * seguir. Nao ha mensagem util nenhuma; parece que o aparelho recusou.
 *
 * A resposta e sempre a mesma: aparelho inteiro sob gestao. Nao existe o caso de
 * perfil de trabalho aqui — o aparelho e uma vitrine, nao o celular pessoal de
 * alguem com uma area separada da empresa.
 *
 * Esta tela nao aparece para ninguem: responde e fecha no mesmo instante.
 */
class ProvisioningActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            setResult(
                RESULT_OK,
                Intent().putExtra(
                    DevicePolicyManager.EXTRA_PROVISIONING_MODE,
                    DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE,
                ),
            )
        } else {
            setResult(RESULT_OK)
        }
        finish()
    }
}
