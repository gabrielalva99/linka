package com.linka.agent

import android.content.Context
import android.os.Build
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

    /**
     * Roda a faxina e devolve um relato para o painel.
     *
     * O relato nomeia o que foi limpo e separa "não tinha nada" de "não consegui":
     * um "0 arquivos" silencioso esconderia aparelho sem permissão, e alguém só
     * descobriria olhando a galeria de um aparelho na loja.
     */
    fun run(ctx: Context): String {
        val partes = mutableListOf<String>()

        if (podeApagarArquivos()) {
            var files = 0
            for (dir in MEDIA_DIRS) {
                files += wipe(File(Environment.getExternalStorageDirectory(), dir))
            }
            partes.add("$files arquivo(s)")
        } else {
            partes.add("SEM PERMISSÃO de arquivos (reprovisionar por cabo)")
        }

        val limpos = APPS.filter { clearApp(ctx, it) }.map { it.substringAfterLast('.') }
        partes.add(if (limpos.isEmpty()) "nenhum app limpo" else "apps: ${limpos.joinToString(", ")}")

        Prefs.setLastCleanupDay(ctx, today())
        return partes.joinToString(" · ")
    }

    /** Sem isto o Android 11+ não deixa tocar em DCIM/Pictures de jeito nenhum. */
    private fun podeApagarArquivos(): Boolean =
        Build.VERSION.SDK_INT < 30 || Environment.isExternalStorageManager()

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
            // Não perguntamos antes "esse app existe?": desde o Android 11 um app
            // não enxerga os outros e a pergunta falhava, fazendo a limpeza
            // desistir de tudo (só o Play Store, que é exceção na regra, passava).
            // Quem responde se deu certo é o próprio sistema, no retorno abaixo.
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
