package com.linka.agent

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.PersistableBundle

/**
 * O aperto de mao com o assistente de configuracao do Android, no fluxo do QR.
 *
 * SAO DUAS PERGUNTAS, e nao uma. Descobri isso da pior forma: o aparelho baixou o
 * APK (medido: GET 200 no registro do Storage, com o User-Agent do proprio Razr),
 * instalou, e mesmo assim caiu em "algo deu errado, entre em contato com o
 * administrador de TI" — mensagem generica que cobre uns cinco motivos diferentes
 * e nao aponta nenhum.
 *
 *   1. GET_PROVISIONING_MODE      "que tipo de gestao voce quer?"
 *   2. ADMIN_POLICY_COMPLIANCE    "terminou de se configurar? posso liberar?"
 *
 * A partir do Android 11 as duas sao obrigatorias para app de gestao proprio. Eu
 * tinha respondido so a primeira. O assistente pergunta a segunda, nao encontra
 * quem responda, e cancela tudo — depois de ja ter baixado e instalado, que e
 * justamente o que faz parecer que o problema esta no arquivo.
 *
 * Nenhuma das duas telas aparece para o promotor: respondem e fecham na hora.
 *
 * SEM `android:permission` NO MANIFESTO, e isso custou uma tentativa. Eu tinha
 * copiado `BIND_DEVICE_ADMIN` do padrao do receiver, onde ela e obrigatoria. Numa
 * TELA ela significa o oposto do que eu queria: exige que QUEM CHAMA tenha a
 * permissao. Quem chama e o assistente de configuracao, que nao a tem — entao ele
 * era recusado ao abrir esta tela e cancelava tudo, com a mesma mensagem generica.
 * Medido: o aparelho baixou a 0.56.0 (GET 200 no Storage) e mesmo assim falhou.
 */
class ProvisioningActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        when (intent?.action) {
            // Pergunta 1: aparelho inteiro sob gestao. Nao existe o caso de perfil
            // de trabalho aqui — o aparelho e uma vitrine, nao o celular pessoal
            // de alguem com uma area separada da empresa.
            "android.app.action.GET_PROVISIONING_MODE" -> {
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
            }

            // Pergunta 2: e o ultimo passo do assistente. Aqui o aparelho JA e
            // nosso, entao e o momento certo para aplicar as travas e guardar o
            // codigo da loja — antes disso nao haveria permissao, e depois disso o
            // promotor ja estaria olhando a tela.
            else -> {
                // So o essencial. Quem abre a vitrine e o receiver, ja depois
                // de o assistente terminar: abrir outra tela DE DENTRO desta,
                // no meio do fluxo do sistema, e pedir para o assistente se
                // perder — e ele nao explica quando se perde.
                guardarCodigoDaLoja(intent)
                Kiosk.applyPolicies(this)
                setResult(RESULT_OK)
            }
        }
        finish()
    }

    /**
     * O codigo da loja chega aqui tambem, e nao so no receiver.
     *
     * Guardar nos dois lugares e de proposito: qual dos dois roda primeiro varia
     * entre versoes do Android, e perder o codigo obriga alguem a digitar — que e
     * exatamente o que este fluxo existe para evitar.
     */
    private fun guardarCodigoDaLoja(intent: Intent?) {
        val extras = intent?.getParcelableExtra<PersistableBundle>(
            DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE,
        )
        val codigo = extras?.getString("codigo")?.trim()?.uppercase()
        if (!codigo.isNullOrEmpty()) Prefs.setCodigoDoQr(this, codigo)
    }
}
