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

    /**
     * O aparelho tem senha/PIN de tela?
     *
     * Este hardware recusa o token de reset do Android, então apagar a senha
     * remotamente não é possível: o que dá para fazer é DENUNCIAR. Um aparelho
     * com senha desconhecida vira uma vitrine pedindo PIN no primeiro reinício,
     * e isso não pode ser descoberto pela loja.
     */
    fun screenLockSet(ctx: Context): Boolean =
        try {
            val km = ctx.getSystemService(Context.KEYGUARD_SERVICE)
                as android.app.KeyguardManager
            km.isDeviceSecure
        } catch (_: Exception) {
            false
        }

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
        // Tempo até a tela apagar: 30 minutos.
        //
        // Enquanto a vitrine está na frente ela segura a tela acesa sozinha, então
        // isto só vale quando o CLIENTE está mexendo em outro app. Com o padrão de
        // fábrica (30 segundos) a tela apagava na mão da pessoa. Só o dono do
        // aparelho consegue mudar isso, e a partir do Android 9.
        if (Build.VERSION.SDK_INT >= 28) {
            try {
                dpm.setSystemSetting(
                    admin, android.provider.Settings.System.SCREEN_OFF_TIMEOUT, "1800000",
                )
            } catch (_: Exception) {
                // Fabricante que não permite: o retorno automático continua cobrindo.
            }
        }
        ensureResetToken(ctx)
        // Reaplica o bloqueio a cada início: atualização não pode reabrir a porta.
        applyAppBlocks(ctx, Prefs.blockSettings(ctx))

        // Autoriza o modo quiosque de verdade para este app.
        //
        // Isto nunca existiu. A "proteção" do produto era esconder o app de
        // Ajustes, e foi ela que impediu os aparelhos de ligar. Medido no
        // aparelho antes de escrever isto: mLockTaskModeState=NONE, lista de
        // pacotes autorizados vazia. Ou seja, o cliente sempre pôde puxar a
        // barra de notificações e sair da vitrine.
        //
        // Autorizar aqui não tranca nada sozinho: quem entra no modo é a tela,
        // ao aparecer (ver MainActivity). Separado de propósito, para o aparelho
        // nunca ficar trancado sem uma tela nossa na frente.
        autorizarNoQuiosque(ctx)

        // Tira o aviso de "terminar de configurar o aparelho".
        //
        // É resto do assistente inicial, e some assim que o sistema entende que
        // a configuração acabou. Sem isso ele fica na barra de notificações da
        // vitrine, convidando o cliente a entrar nos Ajustes.
        try {
            dpm.setSecureSetting(admin, "user_setup_complete", "1")
        } catch (_: Exception) {
        }

        // ── Tela inicial obrigatória: DESLIGADO ──────────────────────────────
        //
        // Aqui o LINKA se registrava como a tela inicial do aparelho, para a
        // vitrine voltar sozinha depois de um reinício. Custou dois aparelhos
        // inutilizados para descobrir o que isso faz de verdade:
        //
        // O Android precisa encontrar uma tela inicial para terminar de iniciar
        // o usuário do sistema. Nessa fase o aparelho ainda está travado e o
        // sistema só enxerga componentes preparados para rodar antes do
        // destravamento. Com esta linha, a única tela inicial do aparelho passa
        // a ser a nossa — e, não sendo encontrada nessa fase, o aparelho fica
        // SEM tela inicial nenhuma:
        //
        //     E WindowManager: No home screen found for Intent
        //       { MAIN cat=[HOME] } and user 0
        //
        // A partir daí ele nunca termina de ligar. Não aparece no
        // provisionamento, porque o launcher antigo ainda está de pé: só o
        // primeiro reinício revela, e aí o aparelho já está numa loja.
        //
        // A vitrine continua voltando por três caminhos que não podem impedir o
        // aparelho de ligar: o modo quiosque (lock task), o retorno automático
        // por inatividade e o BootReceiver. São menos garantidos que ser a tela
        // inicial — e essa é a troca certa. Vitrine que às vezes precisa de um
        // empurrão é um problema; aparelho que não liga é um chamado técnico
        // numa loja a 40 km daqui.
        //
        // Para religar isto é preciso, antes, provar num aparelho de verdade
        // que ele reinicia: o app declarando HOME e directBootAware, com os
        // dados em armazenamento protegido por aparelho. Está tudo no lugar,
        // mas não foi validado — e sem validação isto fica desligado.
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
    /**
     * ── Ajustes SAIU desta lista, e o motivo é o defeito mais caro do projeto ──
     *
     * Esconder `com.android.settings` fechava a porta certa e derrubava junto
     * uma coisa que ninguém imagina estar ali: o **FallbackHome**, a tela
     * inicial mínima do Android, mora DENTRO do pacote de Ajustes
     * (`com.android.settings/.FallbackHome`).
     *
     * É a única tela inicial preparada para rodar antes de o aparelho
     * destravar. É ela que segura o boot de qualquer telefone enquanto o
     * launcher de verdade ainda não pode subir — inclusive quando alguém troca
     * de launcher. Escondendo o pacote, o aparelho fica sem NENHUMA tela
     * inicial nessa fase:
     *
     *     E WindowManager: No home screen found for Intent
     *       { MAIN cat=[HOME] } and user 0
     *
     * E nunca termina de ligar. Não aparece no provisionamento: só no primeiro
     * reinício, quando o aparelho já está numa loja. Três aparelhos de teste
     * ficaram inutilizáveis até a causa aparecer, e cada um só voltou com
     * formatação.
     *
     * Confirmado no aparelho: `hidden=true` em com.android.settings, e a
     * consulta por telas iniciais devolvendo "No activities found".
     *
     * O que a gente queria — impedir senha de tela e instalação de app — agora
     * é feito por restrições específicas (ver RESTRICOES_DE_VITRINE), que é o
     * caminho que o Android oferece para isso. Play Store continua escondido:
     * ele não guarda nada de que o sistema precise para ligar.
     */
    private val BLOCKABLE = listOf("com.android.vending")

    /**
     * O que a gente realmente queria ao esconder os Ajustes, dito na linguagem
     * do Android em vez de na marreta.
     *
     * DISALLOW_CONFIG_CREDENTIALS é o que importa de verdade: sem ele o cliente
     * cria uma senha de tela e a vitrine morre no próximo reinício, sem cura
     * possível neste hardware (o token de reset é recusado, medido em campo).
     */
    /**
     * Travas que NUNCA podem entrar nesta lista, e o que cada uma quebraria.
     *
     * Estão aqui como memória: as três já foram adicionadas por mim e removidas
     * no mesmo dia, depois de trancarem o próprio caminho de conserto.
     *
     *  DISALLOW_INSTALL_APPS — bloqueia instalar QUALQUER coisa, inclusive pelo
     *    cabo e pela atualização automática. Medido: `adb install` devolve
     *    "User restriction prevents installing". Com 250 aparelhos na rua, isso
     *    é perder o único jeito de corrigir um defeito sem visita técnica.
     *
     *  DISALLOW_INSTALL_UNKNOWN_SOURCES — mesmo risco: o agente se atualiza a
     *    partir de um APK nosso, que é exatamente "fonte desconhecida".
     *
     *  DISALLOW_DEBUGGING_FEATURES — desliga a depuração USB, que é a corda de
     *    salvamento. Foi por cabo que três aparelhos travados foram
     *    diagnosticados e recuperados hoje. Fechar essa porta é ficar sem
     *    nenhuma quando algo der errado.
     *
     * O que essas três protegiam já é coberto: Play Store escondido, e modo
     * quiosque impedindo o cliente de chegar em Ajustes ou navegador.
     */
    private val NUNCA_RESTRINGIR = listOf(
        android.os.UserManager.DISALLOW_INSTALL_APPS,
        android.os.UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES,
        android.os.UserManager.DISALLOW_DEBUGGING_FEATURES,
    )

    private val RESTRICOES_DE_VITRINE = listOf(
        android.os.UserManager.DISALLOW_CONFIG_CREDENTIALS,
        android.os.UserManager.DISALLOW_FACTORY_RESET,
        android.os.UserManager.DISALLOW_SAFE_BOOT,
        android.os.UserManager.DISALLOW_ADD_USER,
        // Conta no aparelho quebra o controle de dono e reabre sincronização de
        // fotos do cliente. É a primeira coisa que o provisionamento exige que
        // não exista, e não pode voltar depois pela porta dos Ajustes.
        android.os.UserManager.DISALLOW_MODIFY_ACCOUNTS,
        // Relógio errado contamina a telemetria em silêncio: a sessão vai para o
        // servidor com a hora do aparelho, e o BI lê por hora local da loja.
        android.os.UserManager.DISALLOW_CONFIG_DATE_TIME,
        // Idioma trocado deixa a vitrine em outro idioma até alguém ir na loja.
        android.os.UserManager.DISALLOW_CONFIG_LOCALE,
    )

    /**
     * Bluetooth fica de fora desta lista de propósito.
     *
     * Bloquear os Ajustes tinha derrubado junto o pareamento Bluetooth, e a loja
     * ficou sem conseguir demonstrar fone em aparelho sem entrada P2 — uma perda
     * de venda que a gente mesmo causou. Agora que os Ajustes voltaram, o
     * recurso volta com eles, e é para continuar assim.
     */
    private const val BLUETOOTH_LIBERADO = true

    /** Devolve o que foi realmente bloqueado — o painel não deve supor. */
    /**
     * Some com um app da gaveta sem desinstalar.
     *
     * Serve para app de fábrica, que o Android não deixa remover: escondido, o
     * cliente não abre e o ferro continua íntegro para quando o aparelho voltar
     * a ser um celular comum.
     */
    fun esconder(ctx: Context, pacote: String, esconder: Boolean): Boolean =
        try {
            dpm(ctx).setApplicationHidden(admin(ctx), pacote, esconder)
        } catch (_: Exception) {
            false
        }

    /**
     * Quem pode rodar dentro do quiosque.
     *
     * A primeira versão autorizava só o LINKA, e isso quebrava o produto: o
     * cliente ficava preso no vídeo, sem conseguir abrir a câmera. Uma vitrine
     * de celular existe para a pessoa PEGAR o aparelho e testar — travar isso é
     * pior do que não ter trava nenhuma.
     *
     * Então a lista é: tudo que o cliente pode abrir (a mesma lista que o
     * inventário manda ao painel), mais a tela inicial de fábrica para ele ter
     * de onde abrir, menos o que não pode. O que fica de fora não abre nem pelo
     * atalho, nem pela busca, nem por link de outro app.
     */
    private val FORA_DO_QUIOSQUE = setOf(
        "com.android.settings",
        "com.android.vending",
        "com.google.android.packageinstaller",
        "com.android.packageinstaller",
        "com.android.settings.intelligence",
    )

    fun autorizarNoQuiosque(ctx: Context) {
        if (!isDeviceOwner(ctx)) return
        try {
            val permitidos = mutableSetOf(ctx.packageName)
            // A tela inicial de fábrica entra: é de onde o cliente abre a câmera.
            // Sem ela, o quiosque vira uma tela de vídeo e nada mais.
            ctx.packageManager
                .resolveActivity(
                    android.content.Intent(android.content.Intent.ACTION_MAIN)
                        .addCategory(android.content.Intent.CATEGORY_HOME),
                    0,
                )
                ?.activityInfo?.packageName
                ?.let { permitidos.add(it) }
            for (a in Inventory.apps(ctx)) {
                if (a.pacote !in FORA_DO_QUIOSQUE) permitidos.add(a.pacote)
            }
            dpm(ctx).setLockTaskPackages(admin(ctx), permitidos.toTypedArray())
        } catch (_: Exception) {
        }
    }

    /**
     * Tranca a tela no modo quiosque: sem barra de notificações, sem sair do app.
     *
     * Só entra com o aparelho JÁ na frota e com conteúdo na tela. Na tela de
     * pareamento fica destrancado de propósito: aparelho que não conseguiu
     * entrar na frota precisa continuar acessível para o técnico resolver, e um
     * aparelho trancado numa tela que não avança é o mesmo tijolo que a gente
     * acabou de sair.
     */
    fun trancar(activity: android.app.Activity) {
        if (!isDeviceOwner(activity)) return
        try {
            val dpm = dpm(activity)
            // Barra de notificações fechada, MAS o botão de início liberado.
            //
            // Sem o botão de início o cliente não tem como abrir a câmera, e a
            // demonstração morre. Com ele, o cliente vai à tela inicial e abre o
            // que quiser — e o que não está autorizado simplesmente não abre,
            // inclusive os Ajustes. É a diferença entre uma vitrine e um vídeo
            // preso numa moldura.
            if (Build.VERSION.SDK_INT >= 28) {
                dpm.setLockTaskFeatures(
                    admin(activity),
                    DevicePolicyManager.LOCK_TASK_FEATURE_HOME or
                        DevicePolicyManager.LOCK_TASK_FEATURE_OVERVIEW,
                )
            }
            activity.startLockTask()
        } catch (_: Exception) {
            // Fabricante que recusa: o retorno automático continua cobrindo.
        }
    }

    /** Destranca. Usado ao voltar para o pareamento e antes de devolver o aparelho. */
    fun destrancar(activity: android.app.Activity) {
        try {
            activity.stopLockTask()
        } catch (_: Exception) {
        }
    }

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

        // As travas que substituíram o esconde-Ajustes. Aplicadas uma a uma e
        // sem parar na primeira que o fabricante recusar: fechar cinco portas de
        // seis é melhor do que desistir das seis.
        for (r in RESTRICOES_DE_VITRINE) {
            try {
                if (blocked) dpm.addUserRestriction(admin, r)
                else dpm.clearUserRestriction(admin, r)
            } catch (_: Exception) {
            }
        }

        // Desfaz as travas que nunca deveriam ter entrado, sempre.
        //
        // Uma versão minha aplicou as três, e elas trancam o próprio caminho de
        // conserto: sem instalar e sem cabo, um aparelho com defeito só volta
        // com formatação. Como só o dono do aparelho consegue removê-las, este é
        // o único lugar do mundo capaz de desfazer isso — e por isso roda a cada
        // início, e não uma vez.
        for (r in NUNCA_RESTRINGIR) {
            try {
                dpm.clearUserRestriction(admin, r)
            } catch (_: Exception) {
            }
        }
        if (blocked) efetivos.add("senha de tela")

        // NUNCA esconder o pacote de Ajustes: é onde mora a tela inicial de
        // emergência do Android. Se uma versão antiga deixou ele escondido, este
        // é o único lugar do sistema capaz de desfazer isso — o comando de shell
        // é recusado, e o aparelho já não liga para alguém mexer no painel.
        try {
            if (dpm.isApplicationHidden(admin, "com.android.settings")) {
                dpm.setApplicationHidden(admin, "com.android.settings", false)
            }
        } catch (_: Exception) {
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
