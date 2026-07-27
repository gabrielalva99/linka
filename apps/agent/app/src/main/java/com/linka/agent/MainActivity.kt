package com.linka.agent

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
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
    private var waitingShown = false
    private var playingLocal = false

    companion object {
        /** Preenche a tela cortando as bordas (padrão). */
        const val FIT_ZOOM = "zoom"
        /** Mostra o vídeo inteiro, sem cortar (pode sobrar faixa preta). */
        const val FIT_FIT = "fit"

        // Modos reportados ao painel (espelham public.device_mode).
        const val MODE_SHOW = "show"
        const val MODE_MENU = "main_menu"
        const val MODE_STOPPED = "not_running"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.init(this)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        drawBehindCutout()
        // Reaplica as travas a cada início: atualização do app ou do Android não
        // pode destravar a vitrine sem ninguém perceber. É inócuo se não somos dono.
        Kiosk.applyPolicies(this)

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
        // Retoma o último conteúdo conhecido, se estiver no aparelho: reiniciar
        // sem internet (queda de luz na loja de manhã) não pode virar tela preta.
        val last = Prefs.playingUrl(this)
        if (last != null && MediaCache.isCached(this, last)) {
            currentUrl = last
            currentFit = Prefs.playingFit(this) ?: FIT_ZOOM
            playVideo(last, currentFit)
        } else {
            setContentView(waitingView("Carregando conteúdo…"))
        }
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
            // Sem resposta do servidor não é o mesmo que "sem conteúdo": rede da loja
            // caindo não pode apagar a vitrine. Só resposta válida manda trocar.
            if (result.code !in 200..299) return@Thread

            var url: String? = null
            var fit = FIT_ZOOM
            val prefetch = mutableListOf<String>()
            run {
                val body = JSONObject(result.body)
                // optString devolve a string "null" para um JSON null — sem isNull o app
                // tentava tocar um arquivo chamado "null" ao remover o conteúdo.
                if (!body.isNull("content_url")) {
                    url = body.optString("content_url").takeIf { it.isNotEmpty() }
                }
                if (!body.isNull("fit") && body.optString("fit") == FIT_FIT) fit = FIT_FIT
                // Comportamento definido no painel; não exige novo APK para mudar.
                body.optInt("idle_return_seconds", 0).takeIf { it > 0 }?.let {
                    Prefs.setIdleReturnSeconds(this@MainActivity, it)
                }
                if (!body.isNull("volume_percent")) {
                    Prefs.setVolumePercent(this@MainActivity, body.optInt("volume_percent", 0))
                }
                if (!body.isNull("cleanup_time")) {
                    Prefs.setCleanupTime(this@MainActivity, body.optString("cleanup_time"))
                }
                if (!body.isNull("block_settings")) {
                    val bloquear = body.optBoolean("block_settings", false)
                    if (bloquear != Prefs.blockSettings(this@MainActivity)) {
                        Prefs.setBlockSettings(this@MainActivity, bloquear)
                        Kiosk.applyAppBlocks(this@MainActivity, bloquear)
                        Telemetry.beatAsync(this@MainActivity)
                    }
                }
                if (!body.isNull("cleanup_enabled")) {
                    Prefs.setCleanupEnabled(
                        this@MainActivity, body.optBoolean("cleanup_enabled", true),
                    )
                }
                if (!body.isNull("current_version")) {
                    Prefs.setPublishedVersion(
                        this@MainActivity,
                        body.optString("current_version"),
                    )
                }
                // Nova versão publicada: o aparelho se atualiza sozinho.
                body.optJSONObject("agent_update")?.let { up ->
                    SelfUpdate.maybeUpdate(
                        this@MainActivity,
                        up.optString("version"),
                        up.optString("url"),
                    )
                }
                body.optJSONArray("prefetch")?.let { arr ->
                    for (i in 0 until arr.length()) {
                        arr.optString(i).takeIf { it.isNotEmpty() }?.let { prefetch.add(it) }
                    }
                }
            }
            runOnUiThread {
                applyContent(url, fit)
                handlePrefetch(prefetch)
                // Volume vem do painel: mudar não pode exigir novo APK.
                player?.volume = Prefs.volumePercent(this@MainActivity) / 100f
            }
        }.start()
    }

    /**
     * Garante que a campanha inteira esteja no aparelho. Enquanto não estiver, o
     * vídeo atual toca da nuvem para a vitrine não ficar vazia; assim que o
     * arquivo desce, a exibição passa para o local e a rede deixa de importar.
     */
    private fun handlePrefetch(urls: List<String>) {
        if (urls.isEmpty()) return
        MediaCache.prune(this, urls)
        updateSynced(urls)
        for (u in urls) {
            MediaCache.ensure(this, u) { ready ->
                runOnUiThread {
                    if (ready == currentUrl && !playingLocal) playVideo(ready, currentFit)
                    updateSynced(urls)
                }
            }
        }
    }

    private fun updateSynced(urls: List<String>) {
        val synced = MediaCache.allCached(this, urls)
        if (synced != Prefs.synced(this)) {
            Prefs.setSynced(this, synced)
            Telemetry.beatAsync(this)
        }
    }

    /** Aplica o que o painel mandou e confirma de volta (o painel mostra "no ar"). */
    private fun applyContent(url: String?, fit: String) {
        val urlChanged = url != currentUrl
        val fitChanged = fit != currentFit

        // App de pé e sem nada para exibir é "menu inicial", não "não rodando" —
        // vale também quando o app sobe já sem conteúdo (não só na troca).
        val modeChanged = url == null && Prefs.mode(this) != MODE_MENU
        if (modeChanged) Prefs.setMode(this, MODE_MENU)

        currentUrl = url
        currentFit = fit
        Prefs.setPlayingUrl(this, url)
        Prefs.setPlayingFit(this, if (url != null) fit else null)

        if (url == null) {
            // Estado, não transição: subir sem conteúdo também precisa sair do
            // "Carregando…" (senão a vitrine fica presa nessa mensagem para sempre).
            if (!waitingShown) {
                player?.release()
                player = null
                playerView = null
                setContentView(waitingView("Aguardando conteúdo"))
                enterImmersive()
                waitingShown = true
            }
        } else if (urlChanged) {
            playVideo(url, fit)
            waitingShown = false
        } else if (fitChanged) {
            // Só o enquadramento mudou: ajusta sem reiniciar o vídeo.
            playerView?.resizeMode = resizeMode(fit)
        }

        if (urlChanged || fitChanged || modeChanged) Telemetry.beatAsync(this)
    }

    private fun resizeMode(fit: String) =
        if (fit == FIT_FIT) AspectRatioFrameLayout.RESIZE_MODE_FIT
        else AspectRatioFrameLayout.RESIZE_MODE_ZOOM

    /** Tela de espera: preta e discreta. Fundo branco numa vitrine parece app quebrado. */
    private fun waitingView(text: String) = TextView(this).apply {
        this.text = text
        textSize = 16f
        setBackgroundColor(0xFF000000.toInt())
        setTextColor(0xFF666666.toInt())
        gravity = android.view.Gravity.CENTER
        setPadding(56, 56, 56, 56)
    }

    /** Arquivo local quando existe; nuvem só como último recurso. */
    private fun sourceFor(url: String): Uri {
        val local = MediaCache.fileFor(this, url)
        playingLocal = local.exists() && local.length() > 0
        return if (playingLocal) Uri.fromFile(local) else Uri.parse(url)
    }

    private fun playVideo(url: String, fit: String) {
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
            setMediaItem(MediaItem.fromUri(sourceFor(url)))
            repeatMode = Player.REPEAT_MODE_ALL
            // Vitrine é muda por padrão: som só quando o painel liberar para este
            // aparelho — e mesmo assim nunca com o app em segundo plano.
            volume = Prefs.volumePercent(this@MainActivity) / 100f
            playWhenReady = true
            addListener(object : Player.Listener {
                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    // "Demonstração" só quando há frame na tela de verdade; avisa o painel
                    // na hora (a condição evita repetir a cada rebuffer).
                    if (isPlaying && Prefs.mode(this@MainActivity) != MODE_SHOW) {
                        Prefs.setMode(this@MainActivity, MODE_SHOW)
                        Telemetry.beatAsync(this@MainActivity)
                    }
                }

                override fun onPlayerError(error: PlaybackException) {
                    // Zera para o próximo ciclo tentar de novo (falha pode ser transitória).
                    currentUrl = null
                    playerView = null
                    Prefs.setPlayingUrl(this@MainActivity, null)
                    Prefs.setPlayingFit(this@MainActivity, null)
                    Prefs.setMode(this@MainActivity, MODE_STOPPED)
                    setContentView(
                        waitingView("Não foi possível tocar o conteúdo: ${error.errorCodeName}"),
                    )
                    waitingShown = true
                    Telemetry.beatAsync(this@MainActivity)
                }
            })
            prepare()
        }
        view.player = exo
        player = exo
        playerView = view
        setContentView(view)
        enterImmersive()
    }

    /**
     * Sem isto o sistema recua a janela abaixo do furo da câmera e sobra uma faixa
     * preta no topo — a tela nunca fica realmente cheia (medido: 90px no Edge 30 Ultra).
     */
    private fun drawBehindCutout() {
        if (Build.VERSION.SDK_INT >= 28) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
            }
        }
        if (Build.VERSION.SDK_INT >= 30) window.setDecorFitsSystemWindows(false)
    }

    /**
     * Precisa rodar DEPOIS de setContentView: antes disso a janela ainda não tem
     * decor view e o controlador vem nulo (crash na inicialização).
     */
    private fun enterImmersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            window.decorView.windowInsetsController?.let {
                it.hide(WindowInsets.Type.systemBars())
                it.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
            return
        }
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

    /**
     * O cliente saiu do app (foi para a câmera, ajustes…). Marca a hora: o serviço
     * traz a vitrine de volta depois do tempo definido no painel. Ninguém é
     * impedido de testar o aparelho — ele só não fica abandonado fora da demo.
     */
    override fun onPause() {
        super.onPause()
        // Silêncio total fora da vitrine: o cliente pode ter aberto o YouTube para
        // testar som — o nosso áudio por baixo é o pior defeito possível numa loja.
        player?.pause()
        if (Prefs.token(this) != null) Prefs.setLeftAt(this, System.currentTimeMillis())
    }

    override fun onResume() {
        super.onResume()
        Prefs.setLeftAt(this, 0L)
        player?.let {
            it.volume = Prefs.volumePercent(this) / 100f
            it.play()
        }
    }

    /** Voltar não sai da vitrine: dentro do app não há para onde voltar. */
    @Deprecated("Compatibilidade com Activity clássica")
    override fun onBackPressed() {
        // sem super: engole o gesto
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
