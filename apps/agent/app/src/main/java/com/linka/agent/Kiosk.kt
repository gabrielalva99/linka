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
        // Vitrine não precisa de tela de bloqueio, e sem senha o token de reset
        // já nasce ativo — é o que garante a volta se alguém puser um PIN depois.
        try { dpm.setKeyguardDisabled(admin, true) } catch (_: Exception) {}
        ensureResetToken(ctx)
        // Reaplica o bloqueio a cada início: atualização não pode reabrir a porta.
        applyAppBlocks(ctx, Prefs.blockSettings(ctx))

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

    // ── Bloqueio de apps de sabotagem ────────────────────────────────────────
    /**
     * Ajustes e Play Store.
     *
     * Ajustes é o caminho para criar senha de tela — e o Android **não tem** trava
     * específica para isso (medido no aparelho: o token de reset é recusado neste
     * hardware, então não existe cura depois do estrago). Fechar a porta é o que
     * sobra. Play Store impede instalar app qualquer numa vitrine.
     *
     * Câmera, YouTube, navegador e o resto continuam livres: o cliente ainda testa
     * o aparelho de verdade, que é o ponto da demonstração.
     */
    private val BLOCKABLE = listOf("com.android.settings", "com.android.vending")

    /** Devolve o que foi realmente bloqueado — o painel não deve supor. */
    fun applyAppBlocks(ctx: Context, blocked: Boolean): String {
        if (!isDeviceOwner(ctx)) return "não sou dono do aparelho"
        val dpm = dpm(ctx)
        val admin = admin(ctx)
        val efetivos = mutableListOf<String>()
        for (pkg in BLOCKABLE) {
            val ok = try {
                dpm.setApplicationHidden(admin, pkg, blocked)
            } catch (_: Exception) {
                false
            }
            // Confere o estado real em vez de confiar no retorno.
            val agora = try {
                dpm.isApplicationHidden(admin, pkg)
            } catch (_: Exception) {
                false
            }
            if (ok && agora == blocked && blocked) efetivos.add(pkg.substringAfterLast('.'))
        }
        return if (!blocked) "" else efetivos.joinToString(", ")
    }

    /** O que está bloqueado neste momento (para o heartbeat). */
    fun blockedApps(ctx: Context): String {
        if (!isDeviceOwner(ctx)) return ""
        return BLOCKABLE.filter {
            try {
                dpm(ctx).isApplicationHidden(admin(ctx), it)
            } catch (_: Exception) {
                false
            }
        }.joinToString(", ") { it.substringAfterLast('.') }
    }

    // ── Senha na tela de bloqueio ────────────────────────────────────────────
    // Sabotagem clássica de vitrine: alguém põe um PIN e o aparelho vira tijolo.
    // Duas frentes, e a CURA vale mais que a prevenção: com o token guardado, um
    // aparelho travado por brincadeira volta com um clique no painel, sem visita.

    /**
     * Guarda um token que permite apagar a senha depois. Precisa ser gravado
     * ANTES de existir senha — depois já é tarde, e aí só resta ir até a loja.
     */
    fun ensureResetToken(ctx: Context): Boolean {
        if (!isDeviceOwner(ctx)) return false
        val saved = Prefs.resetToken(ctx)
        val bytes = if (saved != null) {
            android.util.Base64.decode(saved, android.util.Base64.NO_WRAP)
        } else {
            ByteArray(32).also { java.security.SecureRandom().nextBytes(it) }
        }
        return try {
            val ok = dpm(ctx).setResetPasswordToken(admin(ctx), bytes)
            if (ok && saved == null) {
                Prefs.setResetToken(
                    ctx,
                    android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP),
                )
            }
            ok
        } catch (_: Exception) {
            false
        }
    }

    fun resetTokenActive(ctx: Context): Boolean =
        try {
            isDeviceOwner(ctx) && dpm(ctx).isResetPasswordTokenActive(admin(ctx))
        } catch (_: Exception) {
            false
        }

    /** Apaga a senha da tela de bloqueio. É o comando que desfaz a brincadeira. */
    fun clearScreenLock(ctx: Context): String {
        if (!isDeviceOwner(ctx)) return "não sou dono do aparelho"
        val saved = Prefs.resetToken(ctx) ?: return "sem token guardado, precisa reprovisionar"
        if (!resetTokenActive(ctx)) {
            return "token inativo: o Android exige confirmar a senha atual uma vez no aparelho"
        }
        return try {
            val bytes = android.util.Base64.decode(saved, android.util.Base64.NO_WRAP)
            val ok = dpm(ctx).resetPasswordWithToken(admin(ctx), null, bytes, 0)
            if (ok) "senha removida" else "recusado pelo sistema"
        } catch (e: Exception) {
            "erro: ${e.javaClass.simpleName}"
        }
    }

    /**
     * Mede o que o Android 15 realmente aceita para IMPEDIR a criação de senha.
     * Igual à sonda da depuração: em vez de afirmar, o aparelho responde.
     */
    fun probeLock(ctx: Context): String {
        if (!isDeviceOwner(ctx)) return "não sou dono do aparelho"
        val partes = mutableListOf<String>()

        partes.add("desativar tela de bloqueio=" + try {
            dpm(ctx).setKeyguardDisabled(admin(ctx), true)
        } catch (_: Exception) { false })

        partes.add("token de reset=" + ensureResetToken(ctx))
        partes.add("token ativo=" + resetTokenActive(ctx))

        // Restrições candidatas: algumas não existem em toda versão, por isso
        // vão como texto e o resultado é lido de volta.
        val um = ctx.getSystemService(Context.USER_SERVICE) as UserManager
        for (r in listOf("no_config_credentials", "no_biometric", "no_config_screen_timeout")) {
            val aplicou = try {
                dpm(ctx).addUserRestriction(admin(ctx), r)
                um.hasUserRestriction(r)
            } catch (_: Exception) { false }
            partes.add("$r=$aplicou")
        }
        return partes.joinToString(" | ")
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
