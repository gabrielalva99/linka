package com.linka.agent

import android.content.Context
import android.os.Environment
import java.io.File
import java.util.Calendar
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Faxina diária do aparelho de demonstração.
 *
 * O cliente tira foto, abre o YouTube, faz login, navega. Sem limpeza, em uma
 * semana a vitrine vira o celular pessoal de estranhos — e a próxima pessoa vê
 * a selfie da anterior. Isso é problema de imagem da marca, não de disco cheio.
 *
 * Duas frentes: arquivos que o cliente criou e dados dos apps que ele mexeu.
 */
object Cleanup {

    /** Onde câmera e downloads deixam rastro. */
    private val MEDIA_DIRS = listOf("DCIM", "Pictures", "Movies", "Download")

    /** Apps de demonstração que guardam sessão/histórico. Nunca o nosso. */
    private val APPS = listOf(
        "com.android.chrome",
        "com.google.android.youtube",
        "com.google.android.apps.photos",
        "com.google.android.googlequicksearchbox",
        "com.motorola.camera5",
        "com.motorola.camera3",
        "com.motorola.gallery",
        "com.google.android.apps.messaging",
        "com.android.vending",
    )

    /** Roda a faxina e devolve um relato curto para o painel. */
    fun run(ctx: Context): String {
        var files = 0
        for (dir in MEDIA_DIRS) {
            files += wipe(File(Environment.getExternalStorageDirectory(), dir))
        }
        var apps = 0
        for (pkg in APPS) if (clearApp(ctx, pkg)) apps++
        Prefs.setLastCleanupDay(ctx, today())
        return "$files arquivo(s) apagado(s), $apps app(s) limpo(s)"
    }

    /** Apaga o conteúdo, mantém a pasta: alguns apps quebram se o diretório some. */
    private fun wipe(dir: File): Int {
        if (!dir.exists() || !dir.isDirectory) return 0
        var count = 0
        dir.listFiles()?.forEach { f ->
            count += if (f.isDirectory) wipe(f).also { f.delete() }
            else if (f.delete()) 1 else 0
        }
        return count
    }

    /**
     * Limpar dados de app é privilégio de dono do aparelho — e é o que apaga
     * login do YouTube, histórico do navegador e conta deixada para trás.
     */
    private fun clearApp(ctx: Context, pkg: String): Boolean {
        if (!Kiosk.isDeviceOwner(ctx)) return false
        return try {
            ctx.packageManager.getPackageInfo(pkg, 0)
            val dpm = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE)
                as android.app.admin.DevicePolicyManager
            val done = CountDownLatch(1)
            var ok = false
            dpm.clearApplicationUserData(
                Kiosk.admin(ctx), pkg, Executors.newSingleThreadExecutor(),
            ) { _, succeeded ->
                ok = succeeded
                done.countDown()
            }
            done.await(10, TimeUnit.SECONDS)
            ok
        } catch (_: Exception) {
            // App não existe neste modelo, ou o sistema recusou: segue a lista.
            false
        }
    }

    private fun today(): String {
        val c = Calendar.getInstance()
        return "%04d-%02d-%02d".format(
            c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH),
        )
    }

    /**
     * Já passou do horário de hoje e ainda não limpou hoje?
     * O horário é o LOCAL do aparelho — a loja em Manaus fecha no horário dela.
     */
    fun shouldRun(ctx: Context): Boolean {
        if (!Prefs.cleanupEnabled(ctx)) return false
        if (Prefs.lastCleanupDay(ctx) == today()) return false
        val target = Prefs.cleanupTime(ctx).split(":")
        val h = target.getOrNull(0)?.toIntOrNull() ?: 23
        val m = target.getOrNull(1)?.toIntOrNull() ?: 0
        val now = Calendar.getInstance()
        val minutesNow = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)
        return minutesNow >= h * 60 + m
    }
}
