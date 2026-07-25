package com.linka.agent

import android.content.Context
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

/**
 * Vídeos guardados no próprio aparelho.
 *
 * Motivo: rede de loja cai e oscila. Tocar direto da nuvem significa vitrine
 * travando no pior momento e o mesmo arquivo sendo baixado a cada repetição —
 * caro no chip 5G. Aqui o arquivo desce uma vez e a exibição não depende mais
 * da rede. O download é atômico (arquivo temporário + renomeia), então nunca
 * existe arquivo pela metade sendo exibido.
 */
object MediaCache {

    /** Uma fila só: baixar em paralelo estrangula o Wi-Fi da loja. */
    private val queue = Executors.newSingleThreadExecutor()
    private val inFlight = mutableSetOf<String>()

    private fun dir(ctx: Context): File =
        File(ctx.filesDir, "content").apply { if (!exists()) mkdirs() }

    /** Nome estável derivado da URL (mesma URL, mesmo arquivo). */
    private fun nameFor(url: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(url.toByteArray())
        return digest.take(16).joinToString("") { "%02x".format(it) } + ".mp4"
    }

    fun fileFor(ctx: Context, url: String): File = File(dir(ctx), nameFor(url))

    fun isCached(ctx: Context, url: String): Boolean {
        val f = fileFor(ctx, url)
        return f.exists() && f.length() > 0
    }

    fun allCached(ctx: Context, urls: List<String>): Boolean =
        urls.isNotEmpty() && urls.all { isCached(ctx, it) }

    /**
     * Baixa em segundo plano se ainda não estiver em cache.
     * [onReady] roda na thread da fila quando o arquivo fica pronto.
     */
    fun ensure(ctx: Context, url: String, onReady: (String) -> Unit = {}) {
        if (isCached(ctx, url)) {
            onReady(url)
            return
        }
        synchronized(inFlight) {
            if (!inFlight.add(url)) return
        }
        queue.execute {
            val ok = download(ctx, url)
            synchronized(inFlight) { inFlight.remove(url) }
            if (ok) onReady(url)
        }
    }

    private fun download(ctx: Context, url: String): Boolean {
        val target = fileFor(ctx, url)
        val temp = File(target.absolutePath + ".part")
        var conn: HttpURLConnection? = null
        try {
            conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 20000
            conn.readTimeout = 60000
            if (conn.responseCode !in 200..299) return false
            val expected = conn.contentLengthLong

            temp.outputStream().use { out ->
                conn.inputStream.use { input -> input.copyTo(out, 64 * 1024) }
            }
            // Arquivo incompleto é pior que arquivo ausente: descarta.
            if (expected > 0 && temp.length() != expected) {
                temp.delete()
                return false
            }
            if (target.exists()) target.delete()
            return temp.renameTo(target)
        } catch (_: Exception) {
            temp.delete()
            return false
        } finally {
            conn?.disconnect()
        }
    }

    /** Apaga o que saiu de cena (campanha trocou) para não lotar o aparelho. */
    fun prune(ctx: Context, keep: List<String>) {
        val keepNames = keep.map { nameFor(it) }.toSet()
        dir(ctx).listFiles()?.forEach { f ->
            val busy = synchronized(inFlight) { inFlight.any { nameFor(it) == f.name } }
            if (!busy && f.name.endsWith(".mp4") && f.name !in keepNames) f.delete()
            if (f.name.endsWith(".part") && !busy) f.delete()
        }
    }

    fun usedBytes(ctx: Context): Long =
        dir(ctx).listFiles()?.sumOf { it.length() } ?: 0L
}
