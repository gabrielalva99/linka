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

class MainActivity : Activity() {

    private var player: ExoPlayer? = null

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
        val waiting = TextView(this).apply {
            text = "Carregando conteúdo…"
            textSize = 18f
            setPadding(56, 120, 56, 56)
        }
        setContentView(waiting)

        Thread {
            val result = try {
                Api.content(token)
            } catch (e: Exception) {
                Api.Result(-1, e.message ?: "erro")
            }
            val url = if (result.code in 200..299) {
                JSONObject(result.body).optString("content_url").takeIf { it.isNotEmpty() }
            } else null
            runOnUiThread {
                if (url != null) playVideo(url) else waiting.text =
                    "Pareado. Aguardando conteúdo…"
            }
        }.start()
    }

    @OptIn(UnstableApi::class)
    private fun playVideo(url: String) {
        enterImmersive()
        val playerView = PlayerView(this).apply {
            useController = false
            // Preenche a tela inteira em qualquer modelo, sem distorcer (corta o excedente).
            resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
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
                    val msg = TextView(this@MainActivity).apply {
                        text = "Não foi possível tocar o conteúdo: ${error.errorCodeName}"
                        setPadding(56, 120, 56, 56)
                    }
                    setContentView(msg)
                }
            })
            prepare()
        }
        playerView.player = exo
        player = exo
        setContentView(playerView)
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
        player?.release()
        player = null
        super.onDestroy()
    }
}
