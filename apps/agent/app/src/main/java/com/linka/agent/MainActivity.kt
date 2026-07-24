package com.linka.agent

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import org.json.JSONObject
import java.util.Timer
import kotlin.concurrent.timerTask

@OptIn(UnstableApi::class)
class MainActivity : Activity() {

    private var player: ExoPlayer? = null
    private var playerView: PlayerView? = null
    private var currentUrl: String? = null
    private var currentFit: String = FIT_ZOOM
    private var contentTimer: Timer? = null

    companion object {
        /** Preenche a tela cortando as bordas (padrão). */
        const val FIT_ZOOM = "zoom"
        /** Mostra o vídeo inteiro, sem cortar (pode sobrar faixa preta). */
        const val FIT_FIT = "fit"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1)
        }

        val token = Prefs.token(this)
        if (token != null) {
            startHeartbeat()
            showContent(token)
        } else {
            showPairing()
        }
    }

    // ── Pareamento ────────────────────────────────────────────────────────
    private fun showPairing() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(56, 120, 56, 56)
        }
        val title = TextView(this).apply { text = "LINKA — Agente"; textSize = 26f }
        val status = TextView(this).apply { textSize = 16f; setPadding(0, 40, 0, 0) }
        val input = EditText(this).apply {
            hint = "Código de pareamento"
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }
        val button = Button(this).apply { text = "Parear" }

        button.setOnClickListener {
            val code = input.text.toString().trim().uppercase()
            if (code.isEmpty()) {
                status.text = "Digite o código de pareamento."
                return@setOnClickListener
            }
            status.text = "Pareando…"
            button.isEnabled = false
            Thread {
                val result = try {
                    Api.provision(code, androidId(), Build.VERSION.RELEASE)
                } catch (e: Exception) {
                    Api.Result(-1, e.message ?: "erro de rede")
                }
                runOnUiThread {
                    button.isEnabled = true
                    if (result.code in 200..299) {
                        val t = JSONObject(result.body).optString("device_token")
                        if (t.isNotEmpty()) {
                            Prefs.setToken(this, t)
                            startHeartbeat()
                            showContent(t)
                        } else status.text = "Resposta inválida do servidor."
                    } else status.text = "Falha (${result.code}): ${result.body}"
                }
            }.start()
        }

        root.addView(title); root.addView(input); root.addView(button); root.addView(status)
        setContentView(root)
    }

    // ── Conteúdo (player) ─────────────────────────────────────────────────
    private fun showContent(token: String) {
        setContentView(waitingView("Carregando conteúdo…"))
        checkContent(token)
        if (contentTimer == null) {
            contentTimer = Timer().also {
                it.scheduleAtFixedRate(timerTask { checkContent(token) }, 20_000L, 20_000L)
            }
        }
    }

    // Busca o conteúdo periodicamente; troca o vídeo ou o enquadramento se mudou no painel.
    private fun checkContent(token: String) {
        Thread {
            val result = try {
                Api.content(token)
            } catch (e: Exception) {
                Api.Result(-1, "")
            }
            var url: String? = null
            var fit = FIT_ZOOM
            if (result.code in 200..299) {
                val body = JSONObject(result.body)
                url = body.optString("content_url").takeIf { it.isNotEmpty() }
                if (body.optString("fit") == FIT_FIT) fit = FIT_FIT
            }
            runOnUiThread { applyContent(url, fit) }
        }.start()
    }

    /** Aplica o que o painel mandou e confirma de volta (o painel mostra "no ar"). */
    private fun applyContent(url: String?, fit: String) {
        val urlChanged = url != currentUrl
        val fitChanged = fit != currentFit
        if (!urlChanged && !fitChanged) return

        currentUrl = url
        currentFit = fit
        Prefs.setPlayingUrl(this, url)
        Prefs.setPlayingFit(this, if (url != null) fit else null)

        if (urlChanged) {
            if (url != null) playVideo(url, fit)
            else setContentView(waitingView("Pareado. Aguardando conteúdo…"))
        } else {
            // Só o enquadramento mudou: ajusta sem reiniciar o vídeo.
            playerView?.resizeMode = resizeMode(fit)
        }
        Telemetry.beatAsync(this)
    }

    private fun resizeMode(fit: String) =
        if (fit == FIT_FIT) AspectRatioFrameLayout.RESIZE_MODE_FIT
        else AspectRatioFrameLayout.RESIZE_MODE_ZOOM

    private fun waitingView(text: String) = TextView(this).apply {
        this.text = text
        textSize = 18f
        setPadding(56, 120, 56, 56)
    }

    private fun playVideo(url: String, fit: String) {
        enterImmersive()
        player?.release()
        val view = PlayerView(this).apply {
            useController = false
            // Enquadramento definido no painel; nunca distorce o vídeo.
            resizeMode = resizeMode(fit)
            setBackgroundColor(0xFF000000.toInt())
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        val exo = ExoPlayer.Builder(this).build().apply {
            setMediaItem(MediaItem.fromUri(Uri.parse(url)))
            repeatMode = Player.REPEAT_MODE_ALL
            playWhenReady = true
            addListener(object : Player.Listener {
                override fun onPlayerError(error: PlaybackException) {
                    // Zera para o próximo ciclo tentar de novo (falha pode ser transitória).
                    currentUrl = null
                    playerView = null
                    Prefs.setPlayingUrl(this@MainActivity, null)
                    Prefs.setPlayingFit(this@MainActivity, null)
                    setContentView(
                        waitingView("Não foi possível tocar o conteúdo: ${error.errorCodeName}"),
                    )
                    Telemetry.beatAsync(this@MainActivity)
                }
            })
            prepare()
        }
        view.player = exo
        player = exo
        playerView = view
        setContentView(view)
    }

    private fun enterImmersive() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
    }

    private fun androidId(): String =
        Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"

    private fun startHeartbeat() {
        val i = Intent(this, HeartbeatService::class.java)
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i) else startService(i)
    }

    override fun onDestroy() {
        contentTimer?.cancel()
        contentTimer = null
        player?.release()
        player = null
        playerView = null
        super.onDestroy()
    }
}
