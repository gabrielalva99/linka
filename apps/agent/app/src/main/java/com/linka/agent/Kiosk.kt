package com.linka.agent

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.IntentFilter
import android.os.Build
import android.os.UserManager

/**
 * Travas de aparelho de demonstração.
 *
 * Regra do produto: o cliente da loja pode mexer em tudo (câmera, tela, som) —
 * menos desligar o Wi-Fi ou ligar o modo avião, porque aí a vitrine morre e
 * ninguém em SP fica sabendo. Essas duas travas **só existem para device owner**
 * (`DISALLOW_CHANGE_WIFI_STATE` / `DISALLOW_AIRPLANE_MODE`); sem esse cargo, o
 * Android não expõe API equivalente.
 *
 * O que NÃO é aplicado de propósito nesta fase:
 * - `DISALLOW_FACTORY_RESET` — é a última saída de emergência; só depois do fluxo provado.
 * - `DISALLOW_DEBUGGING_FEATURES` — fecharia a porta do cabo, que é como entramos.
 * - lock task (kiosk fechado) — impediria testar câmera, que é o ponto da demonstração.
 */
object Kiosk {

    /** Travas do requisito: rede não pode cair pela mão do cliente. */
    private val RESTRICTIONS = buildList {
        add(UserManager.DISALLOW_CONFIG_WIFI)
        if (Build.VERSION.SDK_INT >= 28) add(UserManager.DISALLOW_AIRPLANE_MODE)
        if (Build.VERSION.SDK_INT >= 33) {
            add(UserManager.DISALLOW_CHANGE_WIFI_STATE)
            add(UserManager.DISALLOW_ADD_WIFI_CONFIG)
        }
    }

    private fun dpm(ctx: Context) =
        ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    fun admin(ctx: Context) = ComponentName(ctx, LinkaDeviceAdminReceiver::class.java)

    fun isDeviceOwner(ctx: Context): Boolean =
        try {
            dpm(ctx).isDeviceOwnerApp(ctx.packageName)
        } catch (_: Exception) {
            false
        }

    /** Todas as travas do requisito estão de fato ativas neste momento. */
    fun locked(ctx: Context): Boolean {
        if (!isDeviceOwner(ctx)) return false
        val um = ctx.getSystemService(Context.USER_SERVICE) as UserManager
        return RESTRICTIONS.all { um.hasUserRestriction(it) }
    }

    fun applyPolicies(ctx: Context) {
        if (!isDeviceOwner(ctx)) return
        val dpm = dpm(ctx)
        val admin = admin(ctx)
        for (r in RESTRICTIONS) {
            try {
                dpm.addUserRestriction(admin, r)
            } catch (_: Exception) {
                // Restrição indisponível nesta versão: as outras continuam valendo.
            }
        }
        // Vira a tela inicial: reiniciar o aparelho volta para a vitrine sozinho,
        // sem depender de watchdog (que o Android 15 quebrou).
        try {
            val filter = IntentFilter(android.content.Intent.ACTION_MAIN).apply {
                addCategory(android.content.Intent.CATEGORY_HOME)
                addCategory(android.content.Intent.CATEGORY_DEFAULT)
            }
            dpm.addPersistentPreferredActivity(
                admin,
                filter,
                ComponentName(ctx, MainActivity::class.java),
            )
        } catch (_: Exception) {
        }
    }

    // ── Depuração USB por controle remoto ────────────────────────────────────
    // A porta do cabo é o que permite recuperar aparelho problemático. Poder
    // fechá-la e reabri-la sem visita muda a operação — mas só vale afirmar isso
    // depois de medir no aparelho: o Android foi restringindo `setGlobalSetting`
    // versão a versão.

    fun adbEnabled(ctx: Context): Boolean =
        android.provider.Settings.Global.getInt(
            ctx.contentResolver, android.provider.Settings.Global.ADB_ENABLED, 0,
        ) == 1

    fun setAdbEnabled(ctx: Context, enabled: Boolean): Boolean {
        if (!isDeviceOwner(ctx)) return false
        return try {
            dpm(ctx).setGlobalSetting(
                admin(ctx),
                android.provider.Settings.Global.ADB_ENABLED,
                if (enabled) "1" else "0",
            )
            true
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Desliga e religa a depuração, medindo cada passo. Devolve um relato para o
     * painel — se o religar falhar, o aparelho fica sem cabo até alguém ligar na
     * mão, e é exatamente isso que precisamos saber ANTES de 250 aparelhos.
     */
    fun probeDebug(ctx: Context): String {
        val before = adbEnabled(ctx)
        val offAccepted = setAdbEnabled(ctx, false)
        Thread.sleep(2000)
        val afterOff = adbEnabled(ctx)
        val onAccepted = setAdbEnabled(ctx, true)
        Thread.sleep(2000)
        val afterOn = adbEnabled(ctx)
        return "antes=$before | desligar aceito=$offAccepted -> $afterOff | " +
            "religar aceito=$onAccepted -> $afterOn"
    }

    /**
     * A chave de saída. Solta as travas, devolve a tela inicial ao sistema e
     * abre mão do cargo. Sem isto, "dono do aparelho" só sai com factory reset.
     */
    fun deprovision(ctx: Context): Boolean {
        if (!isDeviceOwner(ctx)) return false
        val dpm = dpm(ctx)
        val admin = admin(ctx)
        for (r in RESTRICTIONS) {
            try {
                dpm.clearUserRestriction(admin, r)
            } catch (_: Exception) {
            }
        }
        try {
            dpm.clearPackagePersistentPreferredActivities(admin, ctx.packageName)
        } catch (_: Exception) {
        }
        return try {
            dpm.clearDeviceOwnerApp(ctx.packageName)
            true
        } catch (_: Exception) {
            false
        }
    }
}
