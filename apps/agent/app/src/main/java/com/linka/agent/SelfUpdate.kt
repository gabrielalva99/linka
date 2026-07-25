package com.linka.agent

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.app.PendingIntent
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Atualização do app sem cabo.
 *
 * 250 aparelhos em 15 lojas não voltam para a bancada a cada correção. Como
 * device owner, o Android permite instalar em silêncio — sem ninguém tocar em
 * "permitir". Em aparelho que não é device owner isso é impossível: nesse caso o
 * agente simplesmente não atualiza, e o painel mostra a versão velha (honesto,
 * em vez de fingir que atualizou).
 */
object SelfUpdate {

    private var running = false

    fun maybeUpdate(ctx: Context, version: String, url: String) {
        if (version == Api.AGENT_VERSION) return
        if (!Kiosk.isDeviceOwner(ctx)) return
        synchronized(this) {
            if (running) return
            running = true
        }
        Thread {
            try {
                val apk = download(ctx, url)
                if (apk != null) install(ctx, apk)
            } catch (_: Exception) {
            } finally {
                running = false
            }
        }.start()
    }

    private fun download(ctx: Context, url: String): File? {
        val temp = File(ctx.cacheDir, "update.apk.part")
        val target = File(ctx.cacheDir, "update.apk")
        var conn: HttpURLConnection? = null
        try {
            conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 20000
            conn.readTimeout = 120000
            if (conn.responseCode !in 200..299) return null
            val expected = conn.contentLengthLong
            temp.outputStream().use { out ->
                conn.inputStream.use { it.copyTo(out, 64 * 1024) }
            }
            // APK pela metade instalado é aparelho quebrado em loja.
            if (expected > 0 && temp.length() != expected) {
                temp.delete()
                return null
            }
            if (target.exists()) target.delete()
            return if (temp.renameTo(target)) target else null
        } catch (_: Exception) {
            temp.delete()
            return null
        } finally {
            conn?.disconnect()
        }
    }

    private fun install(ctx: Context, apk: File) {
        val installer = ctx.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(
            PackageInstaller.SessionParams.MODE_FULL_INSTALL
        )
        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            session.openWrite("linka", 0, apk.length()).use { out ->
                apk.inputStream().use { it.copyTo(out) }
                session.fsync(out)
            }
            val intent = Intent(ctx, MainActivity::class.java)
            val pending = PendingIntent.getActivity(
                ctx, sessionId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
            session.commit(pending.intentSender)
        }
    }
}
