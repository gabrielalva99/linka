package com.linka.agent

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.os.Build
import android.provider.Settings

/**
 * Quem este aparelho é, de um jeito que sobreviva a uma restauração de fábrica.
 *
 * O PROBLEMA. O aparelho se identificava pelo `android_id`, e o `android_id`
 * MUDA quando alguém restaura o aparelho de fábrica. Na loja isso acontece: o
 * cliente mexe, o promotor não consegue destravar, alguém restaura. O aparelho
 * volta, se apresenta como um número novo, e o provisionamento cria um REGISTRO
 * NOVO. O antigo fica de fantasma na frota — com o código da posição, o histórico
 * e a loja dele — e a contagem da frota nunca mais fecha.
 *
 * Com 250 aparelhos em 15 lojas, isso não é hipótese: é o que faz o painel dizer
 * 260 quando existem 250, e ninguém consegue apontar qual sobra.
 *
 * ── A cadeia, do melhor para o pior ────────────────────────────────────────
 *
 * 1. **ID de inscrição corporativa** (`getEnrollmentSpecificId`, Android 12+).
 *    É a API que existe exatamente para isto: um identificador derivado do
 *    hardware + a nossa organização, que SOBREVIVE à restauração de fábrica.
 *    Precisa de `setOrganizationId` antes, e só o dono do aparelho pode chamar.
 *
 * 2. **Número de série do hardware** (`Build.getSerial`). Estável de verdade, mas
 *    desde o Android 10 exige permissão privilegiada — pode estourar exceção
 *    mesmo sendo dono do aparelho. Por isso é o segundo, não o primeiro.
 *
 * 3. **android_id**, o que já usávamos. Fica como último recurso porque é melhor
 *    do que não identificar nada — mas o painel precisa SABER que é ele, senão
 *    confia numa identidade que se apaga.
 *
 * A fonte viaja junto com o valor de propósito. Identidade fraca sem aviso é a
 * mesma classe de defeito que passamos o dia consertando: um dado que parece
 * firme e não é.
 */
object Identidade {

    /**
     * Organização fixa, e não o cliente.
     *
     * O ID de inscrição é derivado de (hardware + organização). Usando o cliente,
     * um aparelho que trocasse de marca ganharia identidade nova — e o caso que
     * interessa é justamente reconhecer o MESMO aparelho físico depois de um
     * reset. O isolamento por cliente é feito no banco, não aqui.
     *
     * Também não pode mudar depois: `setOrganizationId` aceita ser chamado uma
     * vez, e um valor diferente depois é exceção.
     */
    private const val ORGANIZACAO = "linka"

    data class Id(val valor: String, val fonte: String)

    fun estavel(ctx: Context): Id {
        // 1. ID de inscrição corporativa.
        if (Build.VERSION.SDK_INT >= 31 && Kiosk.isDeviceOwner(ctx)) {
            try {
                val dpm = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE)
                    as DevicePolicyManager
                // Idempotente na prática: chamar de novo com o MESMO valor é aceito;
                // com outro valor, estoura — e é por isso que a organização é fixa.
                try {
                    dpm.setOrganizationId(ORGANIZACAO)
                } catch (_: Exception) {
                }
                val esid = dpm.enrollmentSpecificId
                if (esid.isNotEmpty()) return Id(esid, "esid")
            } catch (_: Exception) {
            }
        }

        // 2. Número de série do hardware.
        try {
            @Suppress("DEPRECATION")
            val serial = if (Build.VERSION.SDK_INT >= 26) Build.getSerial() else Build.SERIAL
            if (!serial.isNullOrEmpty() && serial != Build.UNKNOWN) {
                return Id(serial, "serial")
            }
        } catch (_: Exception) {
            // Sem permissão privilegiada: cai para o android_id.
        }

        // 3. Último recurso — o que muda no reset.
        val android = Settings.Secure.getString(
            ctx.contentResolver, Settings.Secure.ANDROID_ID,
        ) ?: "unknown"
        return Id(android, "android_id")
    }
}
