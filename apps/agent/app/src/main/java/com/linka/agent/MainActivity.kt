package com.linka.agent

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.SystemClock
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
import android.widget.ImageView
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
    private var precisaRetrancar = false

    /**
     * A tela de manutencao esta na frente. Nao e o mesmo que a janela de 5
     * minutos estar aberta (isso e Prefs.emManutencao): esta e a tela; aquela e
     * a permissao. Serve para o retorno a vitrine acontecer uma vez so.
     */
    private var telaDeManutencaoAberta = false

    companion object {
        /** Preenche a tela cortando as bordas (padrão). */
        const val FIT_ZOOM = "zoom"
        /** Mostra o vídeo inteiro, sem cortar (pode sobrar faixa preta). */
        const val FIT_FIT = "fit"

        // Modos reportados ao painel (espelham public.device_mode).
        const val MODE_SHOW = "show"
        const val MODE_MENU = "main_menu"
        const val MODE_STOPPED = "not_running"

        // ── Saída de manutenção ─────────────────────────────────────────────
        const val TOQUES_PARA_ABRIR = 7
        const val JANELA_DE_TOQUES_MS = 4_000L
        const val ERROS_DE_PIN_ATE_BLOQUEAR = 3
        const val BLOQUEIO_DE_PIN_MS = 5 * 60_000L

        /**
         * Quanto tempo o aparelho fica liberado.
         *
         * Cinco minutos resolve o que o técnico foi fazer (mover de posição,
         * conferir uma reclamação, recolher) e limita o dano de ele ir embora sem
         * trancar. Porta de manutenção esquecida aberta é pior do que porta
         * nenhuma: cria a sensação de vitrine protegida onde não há proteção.
         */
        const val MANUTENCAO_MS = 5 * 60_000L

        /**
         * Tempo que a tela de PIN espera antes de devolver a vitrine sozinha.
         *
         * Vitrine parada numa tela pedindo PIN e vitrine perdida: o cliente que fez
         * os sete toques por acidente vai embora, e o proximo encontra um teclado
         * numerico em vez da campanha. O retorno automatico normal nao cobre isso —
         * ele so age quando alguem SAI do app, e a tela de PIN esta dentro dele.
         */
        const val PIN_SEM_TOQUE_MS = 45_000L

        /** Pedido do serviço para trancar de novo quando o tempo venceu. */
        const val EXTRA_RETRANCAR = "retrancar"

        /** Pulso do relogio de conteudo. Nem toda volta vira pergunta ao servidor. */
        const val PULSO_MS = 20_000L

        /** Assentado, pergunta a cada 6 voltas de 20s = 2 minutos. */
        const val REDE_DE_SEGURANCA_MS = 30 * 60_000L
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.init(this)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        // Deixa esta tela ACENDER o aparelho, não só mantê-lo aceso. Sem isto,
        // uma vitrine que apagou durante o expediente ficava preta até alguém
        // encostar nela, que é o oposto do que a loja precisa.
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        drawBehindCutout()
        // Reaplica as travas a cada início: atualização do app ou do Android não
        // pode destravar a vitrine sem ninguém perceber. É inócuo se não somos dono.
        Kiosk.applyPolicies(this)

        // Dono do aparelho CONCEDE; so quem nao e dono precisa pedir.
        //
        // Pedir colocava a caixa "Permitir notificacoes?" em cima da vitrine. Isso
        // ficou visivel quando o app passou a voltar sozinho depois de se atualizar:
        // ele retornava certo e trancado, com um dialogo do Android na frente da
        // campanha. Numa loja, e a campanha coberta por uma pergunta que ninguem
        // vai responder.
        Kiosk.liberarPropriasPermissoes(this)
        if (Build.VERSION.SDK_INT >= 33 && !Kiosk.isDeviceOwner(this)) {
            requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1)
        }

        val token = Prefs.token(this)
        if (token != null) {
            startHeartbeat()
            showContent(token)
        } else {
            // O código vem do kit por DOIS caminhos, e a ordem importa.
            //
            // O arquivo é o confiável. O caminho do intent (segundo abaixo) só
            // funciona quando o app ainda não está aberto: depois do
            // provisionamento a vitrine sobe sozinha, e aí o Android entrega o
            // código a uma tela já existente. Na prática o técnico tinha que
            // digitar à mão em todo aparelho, o que em 250 é meia hora de atraso
            // e um erro de digitação garantido.
            //
            // Arquivo não depende de o app estar aberto, nem de tempo, nem de a
            // tela estar na frente. O kit grava, o app lê e apaga.
            val doArquivo = lerCodigoDoKit()
            val doCabo = intent?.getStringExtra("enroll")?.trim()?.uppercase()
            showPairing((doArquivo ?: doCabo)?.takeIf { it.isNotEmpty() })
        }
    }

    /**
     * O código também chega com o app já aberto.
     *
     * Depois do provisionamento a vitrine vira a tela inicial e sobe sozinha, então
     * quando o kit manda o código o app JÁ ESTÁ na frente: o Android entrega o
     * intent aqui e não em onCreate. Sem este método o código era descartado em
     * silêncio e o aparelho ficava esperando alguém digitar.
     */
    /**
     * Lê o código que o kit gravou no aparelho, e apaga o arquivo.
     *
     * Apaga sempre, mesmo se o pareamento falhar depois: código de inscrição
     * largado num arquivo do aparelho é a chave da frota do cliente esquecida
     * dentro do celular que fica na vitrine.
     */
    private fun lerCodigoDoKit(): String? {
        val lugares = listOf(
            java.io.File("/sdcard/linka-enroll.txt"),
            java.io.File("/sdcard/Download/linka-enroll.txt"),
        )
        for (f in lugares) {
            try {
                if (!f.exists()) continue
                val codigo = f.readText().trim().uppercase()
                f.delete()
                if (codigo.isNotEmpty()) return codigo
            } catch (_: Exception) {
            }
        }
        return null
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        // Antes do desvio de aparelho já pareado abaixo: este pedido vem do
        // serviço para aparelho JÁ na frota, e cair no `return` seguinte deixaria
        // a vitrine destravada para sempre.
        if (intent?.getBooleanExtra(EXTRA_RETRANCAR, false) == true) {
            precisaRetrancar = true
            return
        }
        if (Prefs.token(this) != null) return
        // Arquivo primeiro, aqui também: o kit pode ter gravado depois de a tela
        // já estar aberta.
        val doArquivo = lerCodigoDoKit()
        if (!doArquivo.isNullOrEmpty()) {
            showPairing(doArquivo)
            return
        }
        val code = intent?.getStringExtra("enroll")?.trim()?.uppercase()
        if (!code.isNullOrEmpty()) showPairing(code)
    }

    // ── Pareamento ────────────────────────────────────────────────────────
    private fun showPairing(autoCode: String? = null) {
        // Destranca ao voltar para o pareamento: é a tela em que o técnico
        // precisa conseguir mexer no aparelho.
        Kiosk.destrancar(this)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(56, 120, 56, 56)
            setBackgroundColor(getColor(R.color.marca_preto))
        }
        // O técnico que instala vê esta tela antes de qualquer outra coisa.
        // Logotipo em vez de texto: é o primeiro sinal de que o aparelho é nosso.
        val logo = ImageView(this).apply {
            setImageResource(R.drawable.logo_linka)
            adjustViewBounds = true
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, 120,
            )
        }
        val status = TextView(this).apply {
            textSize = 16f
            setPadding(0, 40, 0, 0)
            setTextColor(getColor(R.color.marca_claro))
        }
        val input = EditText(this).apply {
            hint = "Código de pareamento"
            setTextColor(getColor(R.color.marca_claro))
            setHintTextColor(getColor(R.color.marca_cinza))
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }
        val button = Button(this).apply {
            text = "Parear"
            setBackgroundColor(getColor(R.color.marca_verde))
            setTextColor(getColor(R.color.marca_preto))
        }

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
                    Identidade.estavel(this).let { id ->
                        Api.provision(
                            code, androidId(), Build.VERSION.RELEASE, id.valor, id.fonte,
                        )
                    }
                } catch (e: Exception) {
                    Api.Result(-1, e.message ?: "erro de rede")
                }
                runOnUiThread {
                    button.isEnabled = true
                    if (result.code in 200..299) {
                        val resposta = JSONObject(result.body)
                        val t = resposta.optString("device_token")
                        if (t.isNotEmpty()) {
                            Prefs.setToken(this, t)
                            // Faxina de entrada: o aparelho entra na frota limpo.
                            //
                            // A faxina diária só roda de madrugada, então um
                            // aparelho provisionado de manhã passava o dia inteiro
                            // na loja com as fotos e as contas de quem mexeu nele
                            // antes. Aqui é a única vez que ela roda fora de hora.
                            Thread {
                                val relato = Cleanup.run(this)
                                Prefs.setPendingCleanupReport(this, "entrada: $relato")
                                Telemetry.beatAsync(this)
                            }.start()
                            startHeartbeat()

                            // Mostra EM QUE LOJA o aparelho entrou, e segura a
                            // tela alguns segundos para dar tempo de ler.
                            //
                            // Sem isto o técnico não tem como saber se acertou:
                            // a tela pulava direto para o vídeo, e um código de
                            // loja digitado errado ficava com a mesma cara de um
                            // certo. São quinze aparelhos por visita — o erro
                            // apareceria só semanas depois, num relatório.
                            val cliente = resposta.optString("tenant_name")
                            val loja = resposta.optString("store_name")
                            status.text = when {
                                loja.isNotEmpty() -> "Pronto: $cliente · $loja"
                                else -> "Pronto: $cliente · SEM LOJA (avise o escritório)"
                            }
                            status.postDelayed({ showContent(t) }, 5000)
                        } else status.text = "Resposta inválida do servidor."
                    } else {
                        // Recado em português para o erro que o técnico pode
                        // resolver ali mesmo; o resto vai cru, para a foto que
                        // ele manda ao suporte servir de alguma coisa.
                        val erro = try {
                            JSONObject(result.body).optString("error")
                        } catch (_: Exception) {
                            ""
                        }
                        status.text = when (erro) {
                            "store_not_found" ->
                                "Loja não encontrada. Confira o código da loja e tente de novo."
                            "code_not_found" ->
                                "Código do cliente não confere. Confira a folha do kit."
                            else -> "Falha (${result.code}): ${result.body}"
                        }
                    }
                }
            }.start()
        }

        root.addView(logo); root.addView(input); root.addView(button); root.addView(status)
        setContentView(root)

        // Código entregue pelo provisionamento: pareia sozinho, sem toque humano.
        if (autoCode != null) {
            input.setText(autoCode)
            status.text = "Entrando na frota…"
            button.performClick()
        }
    }

    // ── Conteúdo (player) ─────────────────────────────────────────────────
    private fun showContent(token: String) {
        // Tranca o aparelho na vitrine: sem barra de notificações, sem sair.
        //
        // Isto nunca existiu no produto. O que segurava o cliente era o app de
        // Ajustes estar escondido — e foi exatamente isso que impedia o aparelho
        // de ligar. Agora a trava é a ferramenta certa do Android, e ela só
        // acontece AQUI: com o aparelho na frota e conteúdo na tela. Na tela de
        // pareamento o aparelho fica livre, porque aparelho preso numa tela que
        // não avança é o mesmo tijolo de antes.
        //
        // MENOS durante a manutenção. Se o Android matar e recriar esta tela nos
        // cinco minutos liberados (acontece: o técnico abre a câmera, o sistema
        // recolhe memória), trancar aqui cortaria a manutenção no meio sem aviso —
        // e o técnico concluiria que o gesto não funciona. A janela sobrevive ao
        // reinício da tela; quem a fecha é o relógio, sempre.
        if (Prefs.emManutencao(this)) {
            mostrarManutencao()
            // O RELOGIO TAMBEM, e nao so uma consulta.
            //
            // Este return foi um defeito de verdade, e caro: ele saia antes de
            // ligar o relogio de 20 segundos. Aparelho cuja tela reiniciasse
            // dentro dos cinco minutos de manutencao (o Android recolhe memoria
            // quando o tecnico abre a camera) parava de consultar o servidor PARA
            // SEMPRE — sem receber troca de video e sem se atualizar, e sem erro
            // nenhum no painel, porque o heartbeat vive no servico e continuava
            // batendo. Vitrine viva, aparelho surdo.
            ligarRelogioDeConteudo(token)
            return
        }
        Kiosk.trancar(this)

        // Retoma o último conteúdo conhecido, se estiver no aparelho: reiniciar
        // sem internet (queda de luz na loja de manhã) não pode virar tela preta.
        val last = Prefs.playingUrl(this)
        if (last != null && MediaCache.isCached(this, last)) {
            currentUrl = last
            currentFit = Prefs.playingFit(this) ?: FIT_ZOOM
            playVideo(last, currentFit)
        } else {
            setContentView(comSaidaEscondida(waitingView("Carregando conteúdo…")))
        }
        ligarRelogioDeConteudo(token)
    }

    /**
     * Liga o relogio que pergunta ao servidor o que exibir — e se ha versao nova.
     *
     * Existe como funcao propria porque DOIS caminhos chegam na vitrine
     * (a entrada normal e a volta da manutencao) e um deles esquecia de ligar o
     * relogio. Esquecer isto nao quebra nada visivel: o video continua tocando e o
     * heartbeat continua batendo do servico, entao o painel mostra o aparelho
     * saudavel. Ele so para de OBEDECER.
     *
     * Idempotente de proposito: chamar duas vezes nao cria dois relogios.
     */
    private fun ligarRelogioDeConteudo(token: String) {
        ultimaBusca = SystemClock.elapsedRealtime()
        checkContent(token)
        // O servico pode ter esquecido o token no meio do caminho (401 repetido).
        // Sem isto a tela continuaria pedindo conteudo com credencial morta, e o
        // aparelho ficaria numa vitrine congelada sem ninguem entender por que.
        if (Prefs.token(this) == null) {
            showPairing()
            return
        }
        if (contentTimer == null) {
            contentTimer = Timer().also {
                it.scheduleAtFixedRate(
                    // LE O TOKEN DO DISCO A CADA VOLTA, e nao o que foi capturado
                    // quando o relogio ligou.
                    //
                    // Achado nos registros do servidor: agent-content recusado (401)
                    // a cada 20 segundos, sem parar, enquanto o heartbeat do MESMO
                    // aparelho era aceito. O servico le o token do disco toda vez; a
                    // tela carregava uma copia do valor no momento em que o relogio
                    // ligou. Trocado o token (o provisionamento troca a cada entrada),
                    // a tela ficava chamando com o morto PARA SEMPRE — vitrine
                    // congelada, sem receber campanha nova, com o painel dizendo que
                    // o aparelho esta bem porque o heartbeat funciona.
                    timerTask {
                        val atual = Prefs.token(this@MainActivity) ?: return@timerTask
                        if (horaDePerguntar()) {
                            ultimaBusca = SystemClock.elapsedRealtime()
                            checkContent(atual)
                        }
                    },
                    PULSO_MS, PULSO_MS,
                )
            }
        }
    }

    private var ultimaBusca = 0L

    /**
     * Quando vale a pena perguntar por conteudo.
     *
     * O relogio bate a cada 20 segundos, mas quase toda batida decide NAO chamar
     * o servidor — a decisao e local e de graca. Chama em tres casos:
     *
     *  1. ESPERANDO. Sem video ainda, ou campanha baixando. Pode ter um tecnico
     *     na loja olhando o aparelho neste momento; deixa-lo dois minutos em
     *     "Carregando conteudo" faz ele concluir que falhou e mexer no que estava
     *     dando certo. Aqui pressa vale mais que economia.
     *
     *  2. O SERVIDOR AVISOU. O heartbeat de 60s devolve "conteudo_mudou" — ele
     *     compara a revisao que este aparelho aplicou com a de agora. Como a
     *     batida acontece de qualquer jeito, o aviso custa zero chamada, e a
     *     campanha nova entra em ate 80 segundos.
     *
     *  3. REDE DE SEGURANCA (30 min). Se o aviso falhar — bug meu, revisao
     *     corrompida, resposta truncada —, sem isto o aparelho ficaria com a
     *     campanha velha PARA SEMPRE e ninguem perceberia: o painel continuaria
     *     verde, porque o heartbeat funciona. Foi exatamente assim que o token
     *     morto passou despercebido. E a parte que nao se corta.
     */
    private fun horaDePerguntar(): Boolean {
        val esperando = currentUrl == null || !Prefs.synced(this)
        if (esperando) return true
        if (Prefs.novidadePendente(this)) return true
        val agora = SystemClock.elapsedRealtime()
        if (agora - ultimaBusca >= REDE_DE_SEGURANCA_MS) return true
        return false
    }

    // Busca o conteúdo periodicamente; troca o vídeo ou o enquadramento se mudou no painel.
    private fun checkContent(token: String) {
        Thread {
            val result = try {
                Api.content(token)
            } catch (e: Exception) {
                Api.Result(-1, "")
            }
            // 401 aqui conta junto com o do heartbeat.
            //
            // Antes so o heartbeat contava recusa, entao um aparelho cujo token
            // morreu podia bater 401 no conteudo a cada volta, indefinidamente, sem
            // nunca acionar a volta ao pareamento.
            if (result.code == 401) {
                if (Prefs.contarRecusaDeToken(this@MainActivity) >= 5) {
                    Prefs.esquecerToken(this@MainActivity)
                    runOnUiThread { showPairing() }
                }
                return@Thread
            }
            // Sem resposta do servidor não é o mesmo que "sem conteúdo": rede da loja
            // caindo não pode apagar a vitrine. Só resposta válida manda trocar.
            if (result.code !in 200..299) return@Thread
            if (Prefs.recusasDeToken(this@MainActivity) > 0) {
                Prefs.limparRecusasDeToken(this@MainActivity)
            }

            var url: String? = null
            var fit = FIT_ZOOM
            var revisao: String? = null
            val prefetch = mutableListOf<String>()
            run {
                val body = JSONObject(result.body)
                if (!body.isNull("revisao")) {
                    revisao = body.optString("revisao").takeIf { it.isNotEmpty() }
                }
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
                // Expediente da loja: manda a decisão de acender a tela.
                if (!body.isNull("store_opens_at") && !body.isNull("store_closes_at")) {
                    Prefs.setStoreHours(
                        this@MainActivity,
                        body.optString("store_opens_at", "09:00"),
                        body.optString("store_closes_at", "22:00"),
                    )
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
                // PIN de manutenção (só o hash). Chave nula GRAVA nulo de
                // propósito: é assim que trocar ou remover o PIN no painel tira a
                // saída presencial dos aparelhos que já estão na rua.
                Prefs.setMaintenancePinHash(
                    this@MainActivity,
                    if (body.isNull("maintenance_pin_sha256")) null
                    else body.optString("maintenance_pin_sha256").takeIf { it.isNotEmpty() },
                )
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
                // APLICADO — só agora o aparelho pode se declarar em dia. Gravar a
                // revisão lá em cima, ao receber, faria uma resposta que chegou mas
                // não foi aplicada calar o aviso do servidor para sempre.
                Prefs.setRevisao(this@MainActivity, revisao)
                Prefs.setNovidadePendente(this@MainActivity, false)
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
                setContentView(comSaidaEscondida(waitingView("Aguardando conteúdo")))
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

        // Fecha o trecho do vídeo anterior e abre o do novo. Aqui é o único ponto
        // do app que sabe a hora EXATA da troca — o serviço só passa de minuto em
        // minuto, e um minuto de erro é o bastante para atribuir a parada de um
        // cliente ao vídeo errado.
        if (urlChanged) MediaLog.reconciliarAsync(this)

        if (urlChanged || fitChanged || modeChanged) Telemetry.beatAsync(this)
    }

    private fun resizeMode(fit: String) =
        if (fit == FIT_FIT) AspectRatioFrameLayout.RESIZE_MODE_FIT
        else AspectRatioFrameLayout.RESIZE_MODE_ZOOM

    /**
     * Tela de espera: preta, com o logotipo e a mensagem embaixo.
     *
     * Fundo branco numa vitrine parece app quebrado, e texto cinza sozinho numa
     * loja parece aparelho travado. Com a marca, um aparelho esperando conteúdo
     * ainda comunica alguma coisa para quem passa.
     */
    private fun waitingView(text: String) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = android.view.Gravity.CENTER
        setBackgroundColor(getColor(R.color.marca_preto))
        setPadding(56, 56, 56, 56)
        addView(ImageView(context).apply {
            setImageResource(R.drawable.logo_linka)
            adjustViewBounds = true
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, 110,
            )
        })
        addView(TextView(context).apply {
            this.text = text
            textSize = 15f
            setTextColor(getColor(R.color.marca_cinza))
            gravity = android.view.Gravity.CENTER
            setPadding(0, 48, 0, 0)
        })
    }

    // ── Saída de manutenção na loja ───────────────────────────────────────────
    //
    // O PROBLEMA. Desde que a trava de quiosque virou real, o aparelho na
    // vitrine não tem saída presencial. Quem está na loja para trocar o aparelho
    // de posição, conferir uma reclamação ou levá-lo embora dependia de alguém no
    // painel, no escritório, no mesmo minuto. Numa loja a 40 km isso é uma visita
    // técnica por causa de um toque.
    //
    // O GESTO. Sete toques no canto superior esquerdo, dentro de 4 segundos. Fica
    // escondido porque um botão visível de "sair" na vitrine é um convite: quem
    // mexe no aparelho na loja é o cliente curioso, não só o técnico. Sete toques
    // rápidos num quadrado pequeno não acontecem por acidente, e quem não sabe do
    // gesto não descobre por tentativa.
    //
    // DEPOIS DO GESTO ainda vem o PIN. O gesto é obscuridade, não segurança:
    // qualquer pessoa que veja um técnico fazendo aprende. O que autoriza é o PIN.

    private var toquesDeManutencao = 0
    private var primeiroToqueEm = 0L
    private var relogioDaManutencao: Timer? = null
    private var relogioDoPin: Timer? = null

    /** Envolve a vitrine com o alvo invisível do gesto. */
    private fun comSaidaEscondida(conteudo: View): View {
        val root = FrameLayout(this)
        root.addView(
            conteudo,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        val lado = (72 * resources.displayMetrics.density).toInt()
        root.addView(
            View(this).apply {
                layoutParams = FrameLayout.LayoutParams(lado, lado).apply {
                    gravity = android.view.Gravity.TOP or android.view.Gravity.START
                }
                setOnClickListener { contarToqueDeManutencao() }
            },
        )
        return root
    }

    private fun contarToqueDeManutencao() {
        val agora = System.currentTimeMillis()
        // Fora da janela, o contador recomeça deste toque — e não do zero, senão
        // o oitavo toque de uma sequência lenta zeraria e nunca abriria.
        if (agora - primeiroToqueEm > JANELA_DE_TOQUES_MS) {
            primeiroToqueEm = agora
            toquesDeManutencao = 1
            return
        }
        toquesDeManutencao++
        if (toquesDeManutencao < TOQUES_PARA_ABRIR) return
        toquesDeManutencao = 0
        primeiroToqueEm = 0L
        pedirPin()
    }

    private fun sha256(texto: String): String =
        java.security.MessageDigest.getInstance("SHA-256")
            .digest(texto.toByteArray())
            .joinToString("") { "%02x".format(it) }

    private fun pedirPin() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(56, 120, 56, 56)
            setBackgroundColor(getColor(R.color.marca_preto))
        }
        root.addView(
            ImageView(this).apply {
                setImageResource(R.drawable.logo_linka)
                adjustViewBounds = true
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, 100,
                )
            },
        )
        root.addView(
            TextView(this).apply {
                text = "Manutenção"
                textSize = 20f
                setTextColor(getColor(R.color.marca_claro))
                setPadding(0, 40, 0, 0)
            },
        )
        val status = TextView(this).apply {
            textSize = 15f
            setPadding(0, 16, 0, 24)
            setTextColor(getColor(R.color.marca_cinza))
        }
        val voltar = Button(this).apply {
            text = "Voltar para a vitrine"
            setOnClickListener { voltarParaVitrine() }
        }

        val bloqueadoAte = Prefs.pinBloqueadoAte(this)
        val hash = Prefs.maintenancePinHash(this)
        when {
            // Bloqueio primeiro: senão bastaria errar 3 vezes, sair da tela e
            // voltar para ganhar 3 tentativas novas — o limite não limitaria nada.
            System.currentTimeMillis() < bloqueadoAte -> {
                val faltam = ((bloqueadoAte - System.currentTimeMillis()) / 60_000) + 1
                status.text = "Bloqueado por tentativas erradas. Tente em $faltam min."
                root.addView(status); root.addView(voltar)
            }
            // Falha FECHADA: sem PIN definido, não existe saída presencial. O
            // contrário (liberar quando não há PIN) transformaria todo aparelho
            // recém-provisionado numa vitrine destravada por sete toques.
            hash == null -> {
                status.text =
                    "Saída não configurada para este cliente.\n\n" +
                        "Defina o PIN de manutenção no painel, em Clientes. " +
                        "O aparelho recebe em até 20 segundos."
                root.addView(status); root.addView(voltar)
            }
            else -> {
                status.text = "Digite o PIN de manutenção."
                val input = EditText(this).apply {
                    hint = "PIN"
                    inputType = android.text.InputType.TYPE_CLASS_NUMBER or
                        android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD
                    setTextColor(getColor(R.color.marca_claro))
                    setHintTextColor(getColor(R.color.marca_cinza))
                }
                val destravar = Button(this).apply {
                    text = "Destravar"
                    setBackgroundColor(getColor(R.color.marca_verde))
                    setTextColor(getColor(R.color.marca_preto))
                }
                destravar.setOnClickListener {
                    val digitado = input.text.toString().trim()
                    if (sha256(digitado) == hash) {
                        Prefs.limparErrosDePin(this)
                        liberarParaManutencao()
                    } else {
                        Prefs.registrarErroDePin(
                            this, ERROS_DE_PIN_ATE_BLOQUEAR, BLOQUEIO_DE_PIN_MS,
                        )
                        input.setText("")
                        val restam = ERROS_DE_PIN_ATE_BLOQUEAR - Prefs.pinErros(this)
                        status.text = if (Prefs.pinBloqueadoAte(this) > System.currentTimeMillis()) {
                            "PIN errado. Bloqueado por 5 minutos."
                        } else {
                            "PIN errado. Mais $restam tentativa(s) antes de bloquear."
                        }
                    }
                }
                root.addView(status); root.addView(input)
                root.addView(destravar); root.addView(voltar)
            }
        }
        setContentView(root)

        // Devolve a vitrine sozinha se ninguem concluir.
        relogioDoPin?.cancel()
        relogioDoPin = Timer().also {
            it.schedule(
                timerTask {
                    runOnUiThread {
                        if (!Prefs.emManutencao(this@MainActivity)) voltarParaVitrine()
                    }
                },
                PIN_SEM_TOQUE_MS,
            )
        }
    }

    /**
     * Libera o aparelho e marca a hora de trancar de novo.
     *
     * A trilha sobe ANTES de destravar (fica gravada e vai na próxima batida):
     * se dependesse de rede no instante da saída, destravar sem internet — que é
     * justamente o caso suspeito — viraria destravar sem registro.
     */
    private fun liberarParaManutencao() {
        relogioDoPin?.cancel()
        relogioDoPin = null
        Prefs.setSaidaPendente(this, "PIN correto na tela do aparelho")
        Prefs.setManutencaoAte(this, System.currentTimeMillis() + MANUTENCAO_MS)
        Telemetry.beatAsync(this)
        Kiosk.destrancar(this)
        mostrarManutencao()
    }

    private fun mostrarManutencao() {
        telaDeManutencaoAberta = true
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(56, 120, 56, 56)
            setBackgroundColor(getColor(R.color.marca_preto))
        }
        val titulo = TextView(this).apply {
            text = "Aparelho liberado"
            textSize = 22f
            setTextColor(getColor(R.color.marca_verde))
        }
        val conta = TextView(this).apply {
            textSize = 16f
            setPadding(0, 24, 0, 0)
            setTextColor(getColor(R.color.marca_claro))
        }
        val aviso = TextView(this).apply {
            text = "O botão de início e os Ajustes estão liberados. " +
                "A vitrine volta e tranca sozinha quando o tempo acabar.\n\n" +
                "Esta saída foi registrada no painel."
            textSize = 14f
            setPadding(0, 24, 0, 24)
            setTextColor(getColor(R.color.marca_cinza))
        }
        val agora = Button(this).apply {
            text = "Trancar agora"
            setBackgroundColor(getColor(R.color.marca_verde))
            setTextColor(getColor(R.color.marca_preto))
            setOnClickListener { voltarParaVitrine() }
        }
        root.addView(titulo); root.addView(conta); root.addView(aviso); root.addView(agora)
        setContentView(root)

        relogioDaManutencao?.cancel()
        relogioDaManutencao = Timer().also {
            it.scheduleAtFixedRate(
                timerTask {
                    val restamMs = Prefs.manutencaoAte(this@MainActivity) - System.currentTimeMillis()
                    runOnUiThread {
                        if (restamMs <= 0) fecharManutencaoPorTempo()
                        else {
                            val s = (restamMs / 1000).toInt()
                            conta.text = "Tranca de novo em ${s / 60}:${"%02d".format(s % 60)}"
                        }
                    }
                },
                0L, 1_000L,
            )
        }
    }

    /**
     * Fecha a manutenção quando o TEMPO VENCE — e só uma vez.
     *
     * A trava existe porque dois caminhos chegam aqui no vencimento: o relógio
     * desta tela e o serviço (que cobre o caso de a tela não estar mais na
     * frente). Chamados os dois, o vídeo era liberado e recriado duas vezes e a
     * vitrine piscava na cara do cliente.
     *
     * A trava vive AQUI, e não em voltarParaVitrine, e essa separação é o conserto
     * de um defeito que eu mesmo criei: com a trava lá dentro, o botão "Voltar
     * para a vitrine" da tela de PIN não fazia NADA. Naquela tela a marca é falsa
     * — a tela de manutenção nunca abriu, porque a pessoa só digitou o PIN ou
     * desistiu. Resultado na loja: sete toques por acidente, a vitrine vira uma
     * tela pedindo PIN, e o botão de sair está morto. Nada recupera aquilo, porque
     * o retorno automático só age quando alguém SAI do app — e a tela de PIN está
     * dentro dele.
     */
    private fun fecharManutencaoPorTempo() {
        if (!telaDeManutencaoAberta) return
        voltarParaVitrine()
    }

    /**
     * Devolve a vitrine: tranca de novo e volta a exibir.
     *
     * Sempre funciona, de qualquer tela, quantas vezes for chamada. É a saída de
     * emergência do app — e saída de emergência com condição na porta é o mesmo
     * que porta trancada.
     */
    private fun voltarParaVitrine() {
        telaDeManutencaoAberta = false
        relogioDoPin?.cancel()
        relogioDoPin = null
        relogioDaManutencao?.cancel()
        relogioDaManutencao = null
        Prefs.setManutencaoAte(this, 0L)
        Kiosk.trancar(this)
        // Cai no que está gravado quando a memória da tela está vazia.
        //
        // A tela recriada DENTRO da manutenção vai direto para mostrarManutencao()
        // e nunca passa pelo trecho que preenche currentUrl. Sem esta volta ao
        // gravado, apertar "Trancar agora" levava a "Aguardando conteúdo" em vez do
        // vídeo — do lado de fora, idêntico a um botão que não funciona.
        val url = currentUrl ?: Prefs.playingUrl(this)
        if (url != null && MediaCache.isCached(this, url)) {
            currentUrl = url
            currentFit = Prefs.playingFit(this) ?: FIT_ZOOM
            playVideo(url, currentFit)
        } else {
            setContentView(comSaidaEscondida(waitingView("Aguardando conteúdo")))
            enterImmersive()
        }
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
        // Envolvido: é o que põe o alvo do gesto de manutenção sobre o vídeo. O
        // alvo é um quadrado invisível de 72dp no canto — não cobre o vídeo nem
        // atrapalha quem só quer assistir.
        setContentView(comSaidaEscondida(view))
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
        // Trancar de novo tem que ser AQUI, e não em onNewIntent.
        //
        // startLockTask() exige a tela em primeiro plano e resumida. Chamado em
        // onNewIntent, quando a tela ainda está subindo, ele lança exceção — que o
        // Kiosk engole em silêncio. O resultado seria o pior possível: o aparelho
        // voltaria para a vitrine parecendo trancado, e destrancado de verdade.
        if (precisaRetrancar) {
            precisaRetrancar = false
            // Tela recriada pelo Android depois de a janela vencer: nao passou por
            // mostrarManutencao(), entao a guarda ainda esta fechada e o retorno
            // seria engolido — o aparelho ficaria destravado esperando um segundo
            // pedido que nunca vem.
            telaDeManutencaoAberta = true
            voltarParaVitrine()
            return
        }
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
        relogioDaManutencao?.cancel()
        relogioDaManutencao = null
        relogioDoPin?.cancel()
        relogioDoPin = null
        player?.release()
        player = null
        playerView = null
        super.onDestroy()
    }
}
