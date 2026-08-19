package com.linka.agent

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.google.firebase.messaging.FirebaseMessaging
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
import org.json.JSONArray
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

    /**
     * O painel de recursos está na frente?
     *
     * Existe para o RODÍZIO DA CAMPANHA não roubar a tela de quem está usando o
     * painel. Achado conferindo o primeiro teste: a virada de vídeo chama
     * playVideo, que troca a tela inteira — então o cliente ajustando o brilho
     * era jogado de volta para a vitrine no meio do teste, a cada troca de vídeo.
     * Numa campanha de 3 minutos isso acontece o tempo todo.
     *
     * O rodízio continua correndo por baixo: quem volta para a vitrine (pelo
     * botão, pelo tempo ou pela troca de app) já cai no vídeo da vez, porque o
     * índice sai do relógio e não de onde paramos.
     */
    private var painelAberto = false

    /**
     * Instante do último toque DENTRO do painel — e por que não vai para o disco.
     *
     * O retorno automático da vitrine mora no serviço e se apoia em `leftAt`, que
     * é gravado. Só que `leftAt` significa "SAIU do app", e enquanto o painel está
     * na frente ninguém saiu: o serviço zera esse valor ao agir e a tela zera de
     * novo ao voltar. Foi exatamente assim que o aparelho de teste ficou minutos
     * parado no menu — o relógio que deveria devolver a vitrine tinha sido zerado
     * pelos dois lados.
     *
     * Aqui o relógio do painel é só desta tela e só na memória. Não há o que
     * zerar de fora, e o toque do cliente adia sem nenhuma gravação em disco (uma
     * gravação por evento de toque seria dezenas por segundo ao arrastar o
     * controle de brilho, no aparelho mais fraco da frota).
     */
    private var painelUltimoToque = 0L
    private var relogioDoPainel: Timer? = null

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

/**
 * Teto de passadas tocando da NUVEM, por video, gravado no aparelho.
 *
 * Nao e para durar: assim que o arquivo desce, tudo passa a tocar do disco. O teto
 * existe para o caso de o download nao terminar — rede de loja ruim, arquivo
 * grande, aparelho reiniciando. Sem ele, "tocar da nuvem enquanto baixa" vira
 * "tocar da nuvem para sempre", e ninguem descobre ate a fatura chegar.
 *
 * Pior caso com o teto: 18 MB x 3 x 2 videos x 250 aparelhos = 27 GB, uma vez.
 * Sao 11% do incluso no plano, mesmo se TODOS os aparelhos estourarem o teto.
 * Sem o teto, o pior caso nao tem numero.
 */
const val PASSADAS_DA_NUVEM = 3
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // PRIMEIRA COISA DEPOIS DO super: daqui para a frente, qualquer queda vira
        // relato. Instalado antes de tudo porque o trecho mais provável de quebrar
        // é justamente a subida — e é a queda na subida que deixa a vitrine preta.
        CrashLog.instalar(applicationContext)
        Api.init(this)
        pegarEnderecoDePush()
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        // Deixa esta tela ACENDER o aparelho, não só mantê-lo aceso. Sem isto,
        // uma vitrine que apagou durante o expediente ficava preta até alguém
        // encostar nela, que é o oposto do que a loja precisa.
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        drawBehindCutout()
        // A vitrine nasce no brilho máximo, sem esperar ninguém abrir e fechar o
        // painel de recursos.
        Kiosk.brilhoDaVitrine(this)
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
            // O QR vem primeiro: e a unica fonte em que ninguem digitou nada, e
            // por isso a unica que nao pode estar errada.
            val doQr = Prefs.codigoDoQr(this)
            val doArquivo = lerCodigoDoKit()
            val doCabo = intent?.getStringExtra("enroll")?.trim()?.uppercase()
            showPairing((doQr ?: doArquivo ?: doCabo)?.takeIf { it.isNotEmpty() })
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
        val doQr = Prefs.codigoDoQr(this)
        if (!doQr.isNullOrEmpty()) {
            showPairing(doQr)
            return
        }
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
        // SAIDA PARA OS AJUSTES, so nesta tela.
        //
        // O aparelho e candidato a tela inicial do sistema — tem que ser, senao o
        // Android nao acha tela inicial no boot e o aparelho fica preso na
        // animacao (dois aparelhos ja se perderam assim). O efeito colateral e que
        // ele volta para a frente sempre, e quem precisa alcancar os Ajustes de um
        // aparelho ainda nao pareado nao consegue.
        //
        // Foi exatamente o que aconteceu num aparelho que ficou sem rede: cinco
        // caminhos pelo cabo falharam (force-stop, desativar, suspender, tirar
        // sobreposicao, desinstalar) porque o Android protege o dono do aparelho
        // de todos eles. Sobrou restauracao de fabrica — e na loja nao vai ter
        // cabo nem notebook.
        //
        // So aparece aqui: aparelho pareado nao mostra este botao, e a vitrine em
        // operacao continua sem saida, que e o ponto dela.
        root.addView(
            Button(this).apply {
                text = "Abrir Ajustes do aparelho"
                setBackgroundColor(0x00000000)
                setTextColor(0xFF888888.toInt())
                textSize = 13f
                setOnClickListener {
                    try {
                        startActivity(
                            Intent(android.provider.Settings.ACTION_SETTINGS)
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                        )
                    } catch (_: Exception) {
                    }
                }
            },
        )

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

        // A CAMPANHA GRAVADA VOLTA ANTES DE QUALQUER COISA.
        //
        // A lista é o que faz o rodízio. Ela nascia vazia a cada subida do
        // processo e só uma chamada de rede a preenchia — falhando essa chamada,
        // o aparelho ficava travado num vídeo só até a rede de segurança de 30
        // minutos, com o painel verde e a batida em dia. Ver `Prefs.playlistSalva`.
        playlist = playlistDoTexto(Prefs.playlistSalva(this))
        rotacaoSegundos = Prefs.rotacaoSalva(this)

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
        // Com a lista de volta, a próxima virada já tem hora marcada — sem
        // depender de o servidor responder primeiro.
        agendarProximaVirada()
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
                        // O RODIZIO SE CORRIGE AQUI, a cada volta e sem rede.
                        //
                        // Ele e agendado num Handler preso a tela. Tela recriada —
                        // reinicio, atualizacao, o Android reciclando a activity —
                        // e o agendamento morre junto, e o aparelho fica travado no
                        // video que estava exibindo. Nada o rearmava a nao ser uma
                        // busca de conteudo, que virou de 30 em 30 minutos.
                        //
                        // Foi assim que dois aparelhos lado a lado apareceram
                        // exibindo videos diferentes: o que tinha reiniciado por
                        // ultimo parou de virar. Numa loja com 15 aparelhos na
                        // mesma bancada, isso e o defeito mais visivel que existe.
                        //
                        // A conta e local e nao custa nada: rodar toda volta e mais
                        // barato que confiar num agendamento que pode sumir.
                        runOnUiThread {
                            aplicarDoRodizio()
                            agendarProximaVirada()
                        }
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

    /**
     * Pergunta ao Google qual e o endereco deste aparelho no FCM.
     *
     * O `onNewToken` do PushService cobre a TROCA de endereco, mas nao o caso mais
     * comum: o endereco ja existia antes desta versao ser instalada, entao aquele
     * callback nunca vai disparar e o aparelho ficaria para sempre sem atalho —
     * saudavel no painel, so mais lento, que e o tipo de defeito que ninguem
     * reporta. Pedir na subida resolve, e custa nada: a resposta e local.
     */
    private fun pegarEnderecoDePush() {
        try {
            FirebaseMessaging.getInstance().token.addOnSuccessListener { t ->
                if (!t.isNullOrEmpty() && t != Prefs.pushToken(this)) {
                    Prefs.setPushToken(this, t)
                    Telemetry.beatAsync(this)  // sobe junto na proxima batida
                }
            }
        } catch (_: Exception) {
            // Aparelho sem Google Play Services: segue so com o heartbeat. Nao e
            // motivo para a vitrine deixar de funcionar.
        }
    }

    private var ultimaBusca = 0L

    // O RODIZIO DA CAMPANHA, feito pelo aparelho.
    //
    // Ele ja baixa a campanha inteira; nao ha motivo para PERGUNTAR qual vídeo é
    // o da vez. A conta e a mesma do servidor — floor(epoch / periodo) % total —
    // entao a virada cai no mesmo instante, e os aparelhos de uma loja continuam
    // sincronizados entre si sem trocar uma unica mensagem.
    private var playlist: List<Pair<String, String>> = emptyList()
    private var rotacaoSegundos = 0
    private val rodizio = Handler(Looper.getMainLooper())
    private val virarVideo = object : Runnable {
        override fun run() {
            aplicarDoRodizio()
            agendarProximaVirada()
        }
    }

    /** A lista para o disco e de volta. Formato curto porque é gravado a cada campanha. */
    private fun playlistParaTexto(lista: List<Pair<String, String>>): String {
        val arr = JSONArray()
        for ((u, f) in lista) arr.put(JSONObject().put("u", u).put("f", f))
        return arr.toString()
    }

    private fun playlistDoTexto(texto: String?): List<Pair<String, String>> {
        if (texto.isNullOrEmpty()) return emptyList()
        // Lista gravada ilegível não pode derrubar a vitrine: volta vazia, e a
        // primeira resposta do servidor a reconstrói.
        return try {
            val arr = JSONArray(texto)
            val lista = mutableListOf<Pair<String, String>>()
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val u = o.optString("u").takeIf { it.isNotEmpty() } ?: continue
                lista.add(u to if (o.optString("f") == FIT_FIT) FIT_FIT else FIT_ZOOM)
            }
            lista
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun aplicarDoRodizio() {
        if (playlist.isEmpty()) return
        // Cliente com o aparelho na mão tem prioridade sobre a virada de vídeo.
        // Ver `painelAberto`.
        if (painelAberto) return
        val i = if (rotacaoSegundos > 0 && playlist.size > 1) {
            (((System.currentTimeMillis() / 1000) / rotacaoSegundos) % playlist.size).toInt()
        } else {
            0
        }
        val (url, fit) = playlist[i]
        applyContent(url, fit)
    }

    /**
     * Acorda na virada, e nao de segundo em segundo: dorme exatamente o que falta
     * para o proximo multiplo do periodo. Vitrine que fica meses no ar nao pode
     * ter um relogio de 1 Hz so para conferir se ja e hora.
     */
    private fun agendarProximaVirada() {
        rodizio.removeCallbacks(virarVideo)
        if (playlist.size < 2 || rotacaoSegundos <= 0) return
        val periodo = rotacaoSegundos * 1000L
        rodizio.postDelayed(virarVideo, periodo - (System.currentTimeMillis() % periodo))
    }

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
        // SEM LISTA NA MEMÓRIA também é estar esperando, e este caso não se via.
        //
        // O aparelho pode estar exibindo um vídeo (retomado do cache) e mesmo
        // assim não ter campanha nenhuma na mão: é o que sobra quando a busca da
        // subida falha. Como havia vídeo na tela, nada aqui acusava, e a próxima
        // pergunta só sairia dali a 30 minutos — meia hora de aparelho parado num
        // vídeo enquanto o do lado gira a campanha inteira.
        //
        // Não custa chamada a mais no caso normal: aparelho sem conteúdo de
        // verdade já cai no `esperando` acima, porque `currentUrl` é nulo.
        if (playlist.isEmpty()) return true
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
            var novaPlaylist: List<Pair<String, String>>? = null
            var rotacaoRecebida = 0
            val prefetch = mutableListOf<String>()
            run {
                val body = JSONObject(result.body)
                if (!body.isNull("revisao")) {
                    revisao = body.optString("revisao").takeIf { it.isNotEmpty() }
                }
                body.optJSONArray("playlist")?.let { arr ->
                    val lista = mutableListOf<Pair<String, String>>()
                    for (i in 0 until arr.length()) {
                        val item = arr.optJSONObject(i) ?: continue
                        val u = item.optString("url").takeIf { it.isNotEmpty() } ?: continue
                        lista.add(u to if (item.optString("fit") == FIT_FIT) FIT_FIT else FIT_ZOOM)
                    }
                    novaPlaylist = lista
                }
                rotacaoRecebida = body.optInt("rotation_seconds", 0)
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
                // Ritmo da batida. Como o urgente (comando, conteudo) chega por
                // push, este numero decide so a frequencia do "estou aqui" — e e
                // ele que responde por quase toda a conta de chamadas da frota.
                body.optInt("heartbeat_seconds", 0).takeIf { it > 0 }?.let {
                    Prefs.setHeartbeatSeconds(this@MainActivity, it)
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
                val lista = novaPlaylist
                if (lista != null) {
                    playlist = lista
                    rotacaoSegundos = rotacaoRecebida
                    // Grava junto: é o que devolve o rodízio depois de uma subida
                    // sem rede (ver Prefs.playlistSalva).
                    Prefs.setPlaylistSalva(
                        this@MainActivity, playlistParaTexto(lista), rotacaoRecebida,
                    )
                }
                if (playlist.isNotEmpty()) {
                    // Quem decide o vídeo da vez e este aparelho, pelo proprio
                    // relogio. content_url so continua vindo para os agentes que
                    // ja estao na rua.
                    aplicarDoRodizio()
                    agendarProximaVirada()
                } else {
                    rodizio.removeCallbacks(virarVideo)
                    applyContent(url, fit)
                }
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
    private fun comSaidaEscondida(conteudo: View, abrePainel: Boolean = false): View {
        val root = FrameLayout(this)
        root.addView(
            conteudo,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        // O PRIMEIRO TOQUE abre o painel de recursos.
        //
        // Só sobre o VÍDEO (abrePainel), nunca sobre "Aguardando conteúdo" nem
        // sobre as telas de manutenção: abrir um menu de demonstração em cima de
        // uma tela de erro é oferecer câmera a quem está tentando entender por que
        // a vitrine parou.
        //
        // Entra ANTES do alvo do gesto, para o canto de manutenção continuar por
        // cima. Trocar a ordem faria os sete toques abrirem o painel, e a saída
        // presencial sumiria sem nada acusar.
        if (abrePainel) {
            root.addView(
                View(this).apply {
                    layoutParams = FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                    setOnClickListener { abrirPainelDeRecursos() }
                },
            )
        }
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

    /**
     * Abre o painel de recursos.
     *
     * O MODO VIRA `main_menu`, que é o que o painel da operação mostra como
     * "menu inicial". Não é invenção: é o mesmo estado que o incumbente reporta
     * ("Device mode: Not running · Main menu · Show mode ..."), e por isso já
     * existia na nossa lista desde o começo.
     *
     * O QUE ESTÁ TOCANDO NÃO É APAGADO, de propósito. `playing_url` continua
     * apontando para o vídeo da campanha, porque a campanha continua sendo o
     * conteúdo deste aparelho — o cliente só está olhando outra coisa por um
     * minuto. Limpar aqui faria a lista de pendências acusar "no ar, mas sem
     * vídeo na tela" toda vez que alguém tocasse num aparelho: um alerta por
     * cliente atendido, que é o jeito mais rápido de ensinar a ignorar alertas.
     *
     * ── Por que o relógio é daqui, e não o do serviço (defeito de 03/08) ───────
     * A primeira versão marcava `leftAt` e confiava no retorno automático que já
     * existia. Não funcionou, e não podia: `leftAt` quer dizer "saiu do app", e
     * quem está no painel não saiu de lugar nenhum. O serviço zerava o valor ao
     * agir, a tela zerava ao voltar, e o menu ficava na frente para sempre — sem
     * vídeo de campanha, na loja, até alguém encostar no aparelho.
     */
    private fun abrirPainelDeRecursos() {
        if (telaDeManutencaoAberta) return
        Prefs.setMode(this, MODE_MENU)
        Telemetry.beatAsync(this)
        val painel = comSaidaEscondida(
            PainelDeRecursos.montar(
                act = this,
                vitrine = vitrineParaTeste,
                aoInteragir = { painelUltimoToque = System.currentTimeMillis() },
                aoSairDaTela = { fecharRelogioDoPainel() },
                aoFechar = { voltarParaVitrine() },
            ),
        )
        // A BANDEIRA SOBE DEPOIS DE TROCAR A TELA, e a ordem é o conserto.
        //
        // Trocar a tela desmonta o que estava antes, e o painel avisa quando é
        // desmontado — o aviso que baixa a bandeira. Levantando antes, um painel
        // aberto sobre outro se auto-derrubaria: a bandeira iria a `false` no
        // desmonte do primeiro e o menu novo ficaria na tela dizendo que não está.
        setContentView(painel)
        painelAberto = true
        // Depois de setContentView: antes disso a janela ainda não existe.
        enterImmersive()
        iniciarRelogioDoPainel()
    }

    /**
     * O painel saiu da frente: a bandeira cai e o relógio para.
     *
     * Chamado pelo próprio painel ao ser desmontado, o que cobre TODA saída — o
     * botão "Voltar", o tempo sem toque, a troca de vídeo da campanha e, o que
     * motivou isto, os sete toques que abrem a manutenção por cima do painel.
     *
     * Sem esta parte, o relógio do painel continuaria correndo por baixo da tela
     * de PIN e devolveria a vitrine no meio da digitação — pior ainda depois do
     * PIN certo, trancando o aparelho na mão de quem acabou de destravá-lo para
     * trabalhar. Uma proteção nossa anulando a outra, que é o defeito que este
     * arquivo já carrega escrito em outro lugar.
     */
    private fun fecharRelogioDoPainel() {
        painelAberto = false
        relogioDoPainel?.cancel()
        relogioDoPainel = null
    }

    /**
     * Devolve a vitrine quando o painel fica sem toque.
     *
     * Usa o MESMO tempo que o cliente configurou para o retorno automático: para
     * quem opera a loja existe um número só — "sem toque por N segundos, volta a
     * exibir" — e ter dois seria explicar duas coisas para resolver uma.
     *
     * Confere de segundo em segundo em vez de agendar uma vez para daqui a N: com
     * agendamento único, cada toque do cliente teria que remarcar o relógio, e um
     * toque perdido no meio do arrasto do controle deixaria a tela sumindo na mão
     * dele. Conferir é mais barato do que acertar o reagendamento.
     */
    private fun iniciarRelogioDoPainel() {
        relogioDoPainel?.cancel()
        painelUltimoToque = System.currentTimeMillis()
        val limite = Prefs.idleReturnSeconds(this) * 1000L
        if (limite <= 0L) return
        relogioDoPainel = Timer().also {
            it.schedule(
                timerTask {
                    if (!painelAberto) return@timerTask
                    if (System.currentTimeMillis() - painelUltimoToque < limite) return@timerTask
                    runOnUiThread { if (painelAberto) voltarParaVitrine() }
                },
                1_000L,
                1_000L,
            )
        }
    }

    /**
     * O vídeo da campanha, emprestado ao painel como material de teste.
     *
     * REAPROVEITA O REPRODUTOR que já está tocando, em vez de abrir outro: um
     * segundo reprodutor decodificaria o mesmo arquivo duas vezes e, num aparelho
     * de entrada como o G06 da frota, isso aparece como engasgo na tela — no
     * exato momento em que o cliente está avaliando a tela.
     *
     * `comSom` é o que separa os dois testes. Brilho pede vídeo mudo; som pede o
     * áudio ligado, porque é o único jeito de ouvir o alto-falante. Chamar com
     * `false` também é como o painel devolve a vitrine ao silêncio ao sair.
     */
    private val vitrineParaTeste = object : PainelDeRecursos.VitrineParaTeste {
        override fun vista(comSom: Boolean): View? {
            val exo = player ?: return null
            exo.volume = if (comSom) 1f else Prefs.volumePercent(this@MainActivity) / 100f
            return PlayerView(this@MainActivity).apply {
                useController = false
                resizeMode = resizeMode(currentFit)
                setBackgroundColor(0xFF000000.toInt())
                // Passar o reprodutor para esta vista o solta da anterior sozinho;
                // é o próprio ExoPlayer que garante uma vista só por vez. É também
                // por isso que isto NÃO serve para só mexer no som.
                player = exo
            }
        }

        /**
         * Só o som. Nenhuma vista é criada, e o reprodutor continua onde está.
         *
         * A versão anterior chamava `vista(false)` aqui, para reaproveitar o
         * ajuste de volume que já morava lá. O efeito colateral foi caro: cada
         * saída do painel criava uma vista de vídeo que ninguém colocava na tela e
         * levava o reprodutor junto — a vitrine ficava presa em "Aguardando
         * conteúdo", e nem reiniciar o app trazia de volta.
         *
         * A lição, que vale além daqui: função que faz duas coisas vira armadilha
         * no dia em que alguém precisa de uma só.
         */
        override fun devolverSilencio() {
            player?.volume = Prefs.volumePercent(this@MainActivity) / 100f
        }
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
        // A rede sai junto com o quiosque.
        //
        // Destrancar só o quiosque era meia saída: o técnico ganhava os Ajustes e
        // continuava sem poder trocar de wi-fi, que é o motivo número um de ele
        // estar ali. A rede só tranca de novo quando a batida provar que a rede
        // nova alcança o servidor (ver Telemetry).
        Kiosk.liberarRede(this)
        mostrarManutencao()
    }

    /**
     * QUEM ESTÁ RETIRANDO ESTE APARELHO.
     *
     * ── Por que perguntar (pedido do Gabriel, 18/08) ──────────────────────────
     * Desmontar uma vitrine é uma ação cara e, do jeito anterior, anônima: o
     * aparelho sumia da frota e não sobrava rastro de quem fez. "Foi só um teste"
     * é uma resposta barata quando ninguém precisa assinar embaixo.
     *
     * O dado é DECLARATÓRIO, e vale dizer isso em voz alta: ninguém confere a
     * identidade aqui. O que sustenta o registro é o PIN da loja, que só quem
     * trabalha ali tem, mais a hora exata gravada pelo servidor. Não é prova
     * judicial; é o suficiente para uma conversa com nome e data.
     *
     * ── A ordem importa ───────────────────────────────────────────────────────
     * O registro sobe ANTES de o aparelho perder o controle. Depois do
     * desprovisionamento o app é desinstalado, e não existe segunda chance de
     * contar quem foi. Por isso a tela espera a confirmação do servidor em vez de
     * mandar e seguir em frente.
     *
     * ── Sem rede ──────────────────────────────────────────────────────────────
     * Não trava a venda: avisa que o registro não subiu e deixa a pessoa decidir.
     * Loja parada com cliente na frente é um custo real, e o remédio não pode
     * doer mais que a doença.
     */
    private fun telaDeRetirada() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(56, 120, 56, 56)
            setBackgroundColor(getColor(R.color.marca_preto))
        }
        val titulo = TextView(this).apply {
            text = "Retirar da vitrine"
            textSize = 22f
            setTextColor(getColor(R.color.marca_verde))
        }
        val explica = TextView(this).apply {
            text = "Este aparelho vai sair da vitrine e as proteções serão " +
                "removidas para o cliente usar normalmente." +
                System.lineSeparator() + System.lineSeparator() +
                "Identifique quem está fazendo a retirada. A informação fica " +
                "registrada com a data e a hora."
            textSize = 14f
            setPadding(0, 24, 0, 24)
            setTextColor(getColor(R.color.marca_cinza))
        }
        fun campo(dica: String) = EditText(this).apply {
            hint = dica
            setTextColor(getColor(R.color.marca_claro))
            setHintTextColor(getColor(R.color.marca_cinza))
            inputType = android.text.InputType.TYPE_CLASS_TEXT or
                android.text.InputType.TYPE_TEXT_FLAG_CAP_WORDS
        }
        val nome = campo("Nome completo")
        val cargo = campo("Cargo")
        val loja = campo("Loja")
        val status = TextView(this).apply {
            textSize = 14f
            setPadding(0, 24, 0, 8)
            setTextColor(getColor(R.color.marca_claro))
        }

        val confirmar = Button(this).apply {
            text = "Confirmar retirada"
            setBackgroundColor(getColor(R.color.marca_verde))
            setTextColor(getColor(R.color.marca_preto))
        }
        val voltar = Button(this).apply {
            text = "Cancelar"
            setOnClickListener { mostrarManutencao() }
        }

        confirmar.setOnClickListener {
            val n = nome.text.toString().trim()
            // Nome de uma letra não identifica ninguém, e registro que não
            // identifica é pior que registro nenhum: parece resposta e não é.
            if (n.length < 3) {
                status.text = "Escreva o nome de quem está retirando o aparelho."
                return@setOnClickListener
            }
            confirmar.isEnabled = false
            confirmar.text = "Registrando…"
            status.text = "Enviando o registro…"

            val dados = org.json.JSONObject()
                .put("nome", n)
                .put("cargo", cargo.text.toString().trim())
                .put("loja", loja.text.toString().trim())
            Prefs.setRetiradaPendente(this, dados.toString())

            Thread {
                Telemetry.beat(this)
                // Pendência limpa = o servidor confirmou. É o mesmo sinal que o
                // app já usa para a faxina e a saída de manutenção.
                val registrou = Prefs.retiradaPendente(this) == null
                runOnUiThread {
                    if (registrou) {
                        status.text = "Registrado. Removendo as proteções…"
                        concluirRetirada(status, confirmar)
                    } else {
                        status.text = "Sem conexão: o registro NÃO foi enviado." +
                            System.lineSeparator() + System.lineSeparator() +
                            "Se continuar, não vai existir registro de quem retirou " +
                            "este aparelho."
                        confirmar.isEnabled = true
                        confirmar.text = "Continuar mesmo assim"
                        confirmar.setOnClickListener {
                            confirmar.isEnabled = false
                            concluirRetirada(status, confirmar)
                        }
                    }
                }
            }.start()
        }

        root.addView(titulo); root.addView(explica)
        root.addView(nome); root.addView(cargo); root.addView(loja)
        root.addView(status); root.addView(confirmar); root.addView(voltar)
        setContentView(root)
    }

    /** Tira as proteções e oferece a desinstalação. Ponto sem volta. */
    private fun concluirRetirada(status: TextView, botao: Button) {
        val resultado = Kiosk.deprovision(this)
        status.text = resultado
        if (!resultado.startsWith("controle devolvido")) {
            botao.text = "Não foi possível — avise o suporte"
            return
        }

        // SAI DO QUIOSQUE ANTES DE PEDIR A DESINSTALAÇÃO.
        //
        // Sem isto o botão não fazia nada, e "nada" é literal: o instalador de
        // pacotes está FORA_DO_QUIOSQUE de propósito, e o Android recusa abrir
        // app não autorizado durante o modo quiosque SEM erro, sem aviso, sem
        // exceção para capturar. Na loja isso aparece como uma tela que travou —
        // visto na primeira tentativa em 19/08, e eu só descobri porque o Gabriel
        // estava olhando o aparelho: pelo banco e pelo sistema estava tudo certo.
        Kiosk.destrancar(this)

        botao.text = "Desinstalar o LINKA"
        botao.isEnabled = true
        // O botão continua servindo: se a tela do Android não vier (fabricante
        // que recusa, ou o quiosque demorando para soltar), a pessoa toca de
        // novo em vez de ficar sem saída.
        botao.setOnClickListener { pedirDesinstalacao(status) }
        pedirDesinstalacao(status)
    }

    private fun pedirDesinstalacao(status: TextView) {
        val abriu = try {
            startActivity(
                android.content.Intent(
                    android.content.Intent.ACTION_DELETE,
                    android.net.Uri.parse("package:" + packageName),
                ).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            true
        } catch (_: Exception) {
            false
        }
        if (!abriu) {
            status.text = "As proteções já foram removidas e o aparelho está " +
                "liberado." +
                System.lineSeparator() + System.lineSeparator() +
                "Para tirar o aplicativo: Ajustes > Apps > LINKA > Desinstalar."
        }
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
            text = "O botão de início, os Ajustes e a troca de rede Wi-Fi estão " +
                "liberados. A vitrine volta e tranca sozinha quando o tempo acabar.\n\n" +
                "Esta saída foi registrada no painel."
            textSize = 14f
            setPadding(0, 24, 0, 24)
            setTextColor(getColor(R.color.marca_cinza))
        }
        // Atalho para o wi-fi em vez de mandar procurar nos Ajustes.
        //
        // Trocar de rede é o que traz o técnico até aqui na maioria das vezes
        // (senha nova do roteador da loja, aparelho remanejado). Deixar isso a
        // três telas de distância, dentro de Ajustes, é convidar o erro no campo.
        val wifi = Button(this).apply {
            text = "Trocar rede Wi-Fi"
            setOnClickListener {
                val acao = if (android.os.Build.VERSION.SDK_INT >= 29) {
                    android.provider.Settings.Panel.ACTION_WIFI
                } else {
                    android.provider.Settings.ACTION_WIFI_SETTINGS
                }
                val abriu = try {
                    startActivity(android.content.Intent(acao))
                    true
                } catch (_: Exception) {
                    false
                }
                // O painel de wi-fi não existe em todo fabricante: cai na tela
                // cheia de Ajustes de rede antes de desistir.
                if (!abriu) {
                    try {
                        startActivity(
                            android.content.Intent(
                                android.provider.Settings.ACTION_WIFI_SETTINGS,
                            ),
                        )
                    } catch (_: Exception) {
                        aviso.text = "Não consegui abrir os Ajustes de Wi-Fi neste " +
                            "aparelho. Abra pelos Ajustes do sistema — a rede está " +
                            "destravada enquanto esta manutenção durar."
                    }
                }
            }
        }
        val agora = Button(this).apply {
            text = "Trancar agora"
            setBackgroundColor(getColor(R.color.marca_verde))
            setTextColor(getColor(R.color.marca_preto))
            setOnClickListener { voltarParaVitrine() }
        }
        // PREPARAR PARA VENDA: o aparelho de exposição sai da vitrine e vai para
        // as mãos de um cliente.
        //
        // ── Por que aqui, e não no painel (levantado pelo Gabriel, 18/08) ──────
        // A loja VENDE os aparelhos de exposição, e quem vende é o vendedor, com
        // o cliente na frente. Ele não tem acesso ao painel do LINKA e não vai
        // esperar alguém remoto liberar para fechar a venda — vai resolver na
        // marra, e "na marra" é entregar o aparelho ainda travado.
        //
        // Esta tela já está atrás do PIN da loja, que é exatamente a autorização
        // certa: quem trabalha ali tem, e o cliente que está mexendo na vitrine
        // não tem.
        //
        // ── Dois toques, de propósito ─────────────────────────────────────────
        // É irreversível: o aparelho sai da frota e só volta pelo cabo. Um toque
        // sem querer no meio de uma manutenção de rotina não pode desmontar um
        // aparelho que ia continuar na vitrine.
        val venda = Button(this).apply {
            text = "Preparar para venda"
            setOnClickListener { telaDeRetirada() }
        }

        root.addView(titulo); root.addView(conta); root.addView(aviso)
        root.addView(wifi); root.addView(venda); root.addView(agora)
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
        fecharRelogioDoPainel()
        relogioDoPin?.cancel()
        relogioDoPin = null
        relogioDaManutencao?.cancel()
        relogioDaManutencao = null
        Prefs.setManutencaoAte(this, 0L)
        Kiosk.trancar(this)
        // O brilho volta ao padrão junto com a vitrine.
        //
        // Aqui, e não no botão "Voltar" do painel: esta é a porta única por onde
        // TODA saída passa — botão, retorno automático, fim da manutenção, tela
        // recriada pelo Android. Amarrado só ao botão, o cliente que largasse o
        // aparelho no controle de brilho deixaria a tela escura para o resto do
        // dia, que é justamente o caso que ninguém está olhando.
        Kiosk.brilhoNoMaximo(this)
        // E a janela da vitrine trava no máximo, que é o que realmente decide o
        // que a loja enxerga — o ajuste do sistema acima é para os apps de fora.
        Kiosk.brilhoDaVitrine(this)
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
        // O vídeo está tomando a tela: o painel não está mais na frente, venha
        // isso de onde vier (conteúdo novo, volta da manutenção, retorno
        // automático). Marcar aqui, no único lugar que troca a tela pelo vídeo,
        // evita a bandeira ficar presa em "aberto" e travar o rodízio para sempre.
        fecharRelogioDoPainel()
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
        // DA NUVEM NUNCA SE REPETE. Este e o unico lugar do produto com risco de
        // estourar a conta de verdade.
        //
        // A conta, medida: um video de 13 MB em repeticao continua consome de 1 a
        // 2 GB por hora, por aparelho. Com 250 aparelhos sem cache no dia da
        // instalacao, isso e 250 a 500 GB por HORA — o plano inteiro em menos de
        // uma hora. Baixar o mesmo video 250 vezes custa 7,8 GB e nao preocupa
        // ninguem; o loop e que e caro.
        val daNuvem = !playingLocal
        // DOIS APARELHOS LADO A LADO NO MESMO QUADRO.
        //
        // O rodízio já sincroniza a TROCA de vídeo: a conta floor(epoch/período)
        // é a mesma em todo aparelho, então a virada cai no mesmo instante. O que
        // faltava era a posição DENTRO do vídeo — e ela só aparece quando a
        // campanha tem uma peça só, porque aí não existe virada: cada aparelho
        // começa o laço no instante em que carregou. Numa peça de 15 segundos,
        // meio segundo de diferença no boot vira defasagem permanente, e a mesa
        // com dois aparelhos fica visivelmente errada.
        //
        // A correção usa o mesmo relógio do rodízio: a posição é `epoch % duração`.
        // Ninguém troca mensagem com ninguém — dois aparelhos com a hora certa
        // caem no mesmo quadro sozinhos, e um aparelho que reinicia no meio do dia
        // volta alinhado em vez de esperar a próxima virada.
        //
        // Só vale para vídeo em laço (arquivo local). Da nuvem o vídeo toca uma
        // passada e para, então não há laço para alinhar.
        var jaAlinhou = false
        val exo = ExoPlayer.Builder(this).build().apply {
            setMediaItem(MediaItem.fromUri(sourceFor(url)))
            repeatMode = if (daNuvem) Player.REPEAT_MODE_OFF else Player.REPEAT_MODE_ALL
            // Vitrine é muda por padrão: som só quando o painel liberar para este
            // aparelho — e mesmo assim nunca com o app em segundo plano.
            volume = Prefs.volumePercent(this@MainActivity) / 100f
            playWhenReady = true
            addListener(object : Player.Listener {
                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    // "Demonstração" só quando há frame na tela de verdade; avisa o painel
                    // na hora (a condição evita repetir a cada rebuffer).
                    //
                    // COM O PAINEL ABERTO, NÃO. O vídeo continua correndo por baixo
                    // (é o material dos testes de brilho e som), então o reprodutor
                    // avisa "estou tocando" e isso viraria "Demonstração" — com o
                    // menu ocupando a tela inteira. Foi o que apareceu no aparelho
                    // de teste em 03/08: parado no menu havia minutos e reportando
                    // exibição normal, idêntico a um aparelho saudável. Numa frota
                    // de 250, a operação nunca descobre.
                    if (isPlaying && !painelAberto && Prefs.mode(this@MainActivity) != MODE_SHOW) {
                        Prefs.setMode(this@MainActivity, MODE_SHOW)
                        Telemetry.beatAsync(this@MainActivity)
                    }
                }

                override fun onPlaybackStateChanged(state: Int) {
                    // ALINHA O LAÇO, uma vez, assim que a duração é conhecida.
                    //
                    // Só dá para calcular aqui: antes de preparar, o reprodutor não
                    // sabe quanto dura o arquivo. O salto acontece nos primeiros
                    // milissegundos, antes de alguém olhar.
                    //
                    // Falha fechada de propósito: sem duração utilizável, não faz
                    // nada e o vídeo toca do começo, como sempre tocou. Dois
                    // aparelhos fora de sincronia é um detalhe estético; vitrine
                    // que não sobe porque a conta deu errado é a loja parada.
                    if (state == Player.STATE_READY && !jaAlinhou && !daNuvem) {
                        jaAlinhou = true
                        val dur = duration
                        if (dur > 1000 && dur != androidx.media3.common.C.TIME_UNSET) {
                            seekTo(System.currentTimeMillis() % dur)
                        }
                    }
                    // Acabou uma passada vinda da nuvem. Enquanto o arquivo nao
                    // desce, mostra que esta preparando em vez de recomecar: a
                    // vitrine fica alguns minutos sem video na instalacao, e isso
                    // custa infinitamente menos que a rede da loja saturada e a
                    // conta estourada.
                    if (state == Player.STATE_ENDED && daNuvem) {
                        val n = Prefs.contarPassadaDaNuvem(this@MainActivity, url)
                        currentUrl = null
                        when {
                            // JA DESCEU: toca do arquivo, e o contador nao vale mais
                            // nada. Antes o teste era `n < PASSADAS && isCached`, e o
                            // `n` derrubava o caso bom: arquivo pronto no disco, mas
                            // como o video ja tinha passado tres vezes pela nuvem, a
                            // vitrine ia para a tela de espera assim mesmo.
                            MediaCache.isCached(this@MainActivity, url) -> {
                                Prefs.limparPassadasDaNuvem(this@MainActivity, url)
                                playVideo(url, fit)
                            }
                            // AINDA BAIXANDO: repete da nuvem, dentro do orcamento.
                            // Este era o caminho que NAO existia — sem cache o codigo
                            // caia direto na tela de espera, entao todo video pesado
                            // piscava "Aguardando conteudo" ao fim de CADA passada
                            // enquanto o arquivo descia. Visto em campo na Casas Bahia
                            // Interlagos (18/08): tres videos de 13 a 15 Mbps, e a
                            // vitrine piscando entre uma volta e outra.
                            n < PASSADAS_DA_NUVEM -> playVideo(url, fit)
                            // Orcamento estourado: para de puxar da nuvem e espera o
                            // download. Rede de loja saturada custa mais caro que
                            // alguns minutos sem video na instalacao.
                            else -> applyContent(null, fit)
                        }
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
        //
        // `abrePainel` só aqui: este é o ÚNICO lugar em que há vídeo de campanha
        // na tela, e portanto o único em que "tocar" significa "quero
        // experimentar o aparelho". Nas telas de espera e de manutenção o mesmo
        // toque significa outra coisa.
        setContentView(comSaidaEscondida(view, abrePainel = true))
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
        // VOLTOU DE FORA COM O PAINEL ABERTO: quem tem que reaparecer é a VITRINE.
        //
        // Achado pelo Gabriel em 03/08: painel aberto, ele foi para a tela do
        // celular, e o retorno automático trouxe de volta o MENU, não o vídeo. Faz
        // sentido do lado do Android — o retorno traz a TELA para a frente, e a
        // tela ainda era o painel — e não faz sentido nenhum do lado da loja: o
        // cliente foi embora e o próximo que passa encontra um menu de testes onde
        // deveria estar o anúncio que a marca pagou.
        //
        // Pior: chegando aqui o relógio de "saiu do app" é zerado logo acima, e o
        // painel não tinha relógio próprio. O menu ficava para sempre.
        if (painelAberto) {
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
        relogioDoPainel?.cancel()
        relogioDoPainel = null
        player?.release()
        player = null
        playerView = null
        super.onDestroy()
    }
}
