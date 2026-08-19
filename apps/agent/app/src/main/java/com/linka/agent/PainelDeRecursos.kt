package com.linka.agent

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.media.AudioManager
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * O PAINEL DE RECURSOS: o que o cliente da loja pode experimentar.
 *
 * ── Por que existe ─────────────────────────────────────────────────────────
 * Hoje o caminho do cliente até a câmera é o BOTÃO DE INÍCIO, que leva à tela da
 * Motorola inteira — LinkedIn, Gmail, Facebook. Foi solução provisória: sem ela a
 * demonstração morria, porque a vitrine era um vídeo preso numa moldura. O preço
 * é que a marca perde o controle da própria vitrine no exato momento em que o
 * cliente demonstra interesse.
 *
 * Com este painel, o caminho passa a ser nosso. E aí — só aí — dá para tirar
 * LOCK_TASK_FEATURE_HOME e a tela da Motorola sai de cena, nem por acidente.
 * Nesta ordem, nunca ao contrário: enquanto o painel não estiver provado em
 * aparelho de verdade, tirar o botão de início deixa o cliente sem caminho
 * nenhum.
 *
 * ── O desenho não foi inventado aqui ───────────────────────────────────────
 * O incumbente já opera assim, e está escrito na referência dele: "Página de
 * primeiro toque" e "Tempo de retorno à página inicial: 15s". Ou seja: o vídeo
 * atrai, o PRIMEIRO TOQUE abre o menu, e sem toque ele volta sozinho. Não é
 * novidade nossa — é paridade. Por isso o modo `main_menu` já existia no nosso
 * agente desde o começo, herdado do mesmo modelo.
 *
 * A novidade nossa é outra: MEDIR. O incumbente tem os botões e não sabe dizer
 * qual foi tocado. "382 pessoas testaram o Bluetooth no Razr contra 41 no G06"
 * orienta sortimento e treinamento de loja, e nenhum concorrente entrega.
 *
 * ── Regra de ouro: cada toque é uma medição ────────────────────────────────
 * Toque no painel vira evento na hora, com o recurso que foi tocado. Não é o
 * mesmo dado do tempo de uso: quem abre a câmera já é medido pelo uso do app da
 * câmera. Aqui se mede a INTENÇÃO — o que o cliente quis experimentar — e é por
 * isso que os dois números convivem sem se contar duas vezes.
 *
 * Para brilho e volume, que não abrem app nenhum, este é o ÚNICO sinal que
 * existe. Sem ele, o recurso mais mexido da loja seria invisível no relatório.
 */
object PainelDeRecursos {

    /**
     * De onde vem a IMAGEM E O SOM do teste.
     *
     * ── O defeito que isto conserta (apontado pelo Gabriel, 03/08) ────────────
     * A primeira versão abria "Brilho" numa tela preta com um controle no meio, e
     * "Som" num controle de volume sem áudio nenhum. Os dois funcionavam e não
     * demonstravam coisa alguma: brilho se julga OLHANDO conteúdo, e volume sem
     * som é volume de coisa nenhuma. Na palavra dele: "nada disso acaba virando
     * um teste real".
     *
     * ── E o material de teste já estava no aparelho ───────────────────────────
     * O vídeo da campanha. Já baixado, já tocando, e é o conteúdo da marca — o
     * cliente julga a tela e o alto-falante vendo e ouvindo o produto que o
     * anunciante pagou para exibir. Zero arquivo novo, zero download.
     *
     * Quem monta a vista é a tela principal, porque só ela sabe do reprodutor. O
     * painel só pede: "me dá o vídeo, com ou sem som".
     */
    interface VitrineParaTeste {
        /**
         * Devolve a vista do vídeo, ou nulo se não houver vídeo carregado.
         *
         * ATENÇÃO: isto MOVE o reprodutor para a vista devolvida. Chamar só para
         * mexer no som deixa o reprodutor preso numa vista que ninguém coloca na
         * tela, e a vitrine fica em "Aguardando conteúdo" para sempre — foi
         * exatamente o defeito de 03/08, e é por isso que `devolverSilencio`
         * existe separado.
         */
        fun vista(comSom: Boolean): View?

        /**
         * Devolve a vitrine ao silêncio, SEM tocar na vista.
         *
         * Existe porque a mesma função não pode servir para as duas coisas: quem
         * sai do painel quer só desligar o som, e pedir "a vista muda" para
         * conseguir isso rouba o reprodutor da tela.
         */
        fun devolverSilencio()
    }

    /** Um recurso do painel: a chave que vai para a medição e o rótulo da tela. */
    private data class Recurso(
        val chave: String,
        val rotulo: String,
        val descricao: String,
        val abrir: (Activity, VitrineParaTeste, (View) -> Unit) -> Unit,
    )

    private val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    /**
     * Os recursos desta fatia.
     *
     * Câmera e YouTube abrem o app do sistema — já autorizados no quiosque, e o
     * tempo deles já é medido pelo uso de app. Brilho e volume acontecem DENTRO
     * do painel, porque a barra de notificações está fechada e os Ajustes não
     * abrem: hoje são simplesmente inalcançáveis para quem está na loja.
     *
     * Fora desta fatia, de propósito: Bluetooth (exige o fluxo de pareamento do
     * CompanionDeviceManager), ficha técnica, teste de tela e jogos. Entram
     * depois, e cada um sozinho — recurso novo aqui é uma linha nesta lista.
     */
    private fun recursos(act: Activity): List<Recurso> = buildList {
        add(Recurso("camera", "Câmera", "Tire uma foto") { a, _, _ ->
            abrirPorIntent(a, Intent("android.media.action.STILL_IMAGE_CAMERA"))
        })
        add(Recurso("youtube", "YouTube", "Veja em alta resolução") { a, _, _ ->
            abrirPorPacote(a, "com.google.android.youtube")
        })
        // Só entra onde o aparelho de fato oferece o recurso: a lista é montada
        // por aparelho, não igual para a frota toda. Ver telaDeOtimizacaoDeRam.
        val ram = telaDeOtimizacaoDeRam(act)
        if (ram != null) {
            add(Recurso("ram", "Otimização de RAM", "Veja a memória do aparelho") { a, _, _ ->
                abrirPorIntent(a, ram)
            })
        }
        add(Recurso("brilho", "Brilho da tela", "Veja o vídeo mudar") { a, vitrine, mostrar ->
            mostrar(controleDeBrilho(a, vitrine))
        })
        add(Recurso("volume", "Som", "Ouça o alto-falante") { a, vitrine, mostrar ->
            mostrar(controleDeVolume(a, vitrine))
        })
    }

    /**
     * Monta a tela do painel.
     *
     * `aoInteragir` avisa "o cliente está mexendo aqui" e `aoFechar` devolve a
     * vitrine. Os dois são de quem chama de propósito: o painel não sabe — nem
     * deve saber — como o vídeo é remontado nem por qual relógio a vitrine volta.
     */
    fun montar(
        act: Activity,
        vitrine: VitrineParaTeste,
        aoInteragir: () -> Unit,
        aoSairDaTela: () -> Unit,
        aoFechar: () -> Unit,
    ): View {
        val root = object : LinearLayout(act) {
            /**
             * SAIU DO PAINEL: a vitrine volta ao silêncio e quem chamou fica sabendo.
             *
             * O teste de som liga o áudio do vídeo, e desligar no botão "Voltar"
             * não bastaria — o painel também morre pelo retorno automático, pela
             * troca de vídeo da campanha e pela tela sendo recriada pelo Android.
             * Qualquer um desses caminhos deixaria a vitrine gritando na loja
             * depois que o cliente foi embora, e ninguém no painel saberia.
             *
             * `onDetachedFromWindow` é o único ponto por onde TODOS eles passam —
             * inclusive os que ninguém listou aqui. Por isso o aviso de saída vai
             * junto: quem chamou usa esse aviso para saber que o painel não está
             * mais na frente, e caminhos novos (a tela de manutenção, uma tela que
             * ainda nem existe) passam a ser cobertos sem alterar nada.
             */
            override fun onDetachedFromWindow() {
                super.onDetachedFromWindow()
                vitrine.devolverSilencio()
                aoSairDaTela()
            }

            /**
             * QUALQUER toque aqui dentro adia o retorno automático.
             *
             * Achado no primeiro teste em aparelho: o painel fechava sozinho 30
             * segundos depois de ABRIR, mesmo com o dedo em cima. Só a abertura
             * contava como interação, então o cliente ajustando o brilho via a
             * tela sumir na mão dele — que é a pior hora possível, porque é
             * exatamente quando ele estava interessado.
             *
             * Interceptado aqui, na raiz, e não botão por botão: recurso novo
             * entra depois sem ninguém lembrar de repetir isto, e é justamente
             * o que se esquece.
             *
             * O aviso vai para quem chamou, e não direto para o disco: arrastar o
             * controle de brilho dispara dezenas de eventos por segundo, e gravar
             * cada um deles é jank garantido no aparelho mais fraco da frota —
             * bem na tela em que o cliente está julgando a tela.
             */
            override fun dispatchTouchEvent(ev: android.view.MotionEvent): Boolean {
                aoInteragir()
                return super.dispatchTouchEvent(ev)
            }
        }.apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(act.getColor(R.color.marca_preto))
            setPadding(48, 56, 48, 48)
        }

        root.addView(
            TextView(act).apply {
                text = "Experimente o aparelho"
                textSize = 22f
                setTextColor(act.getColor(R.color.marca_claro))
            },
        )
        root.addView(
            TextView(act).apply {
                text = "Toque para testar"
                textSize = 14f
                setTextColor(act.getColor(R.color.marca_cinza))
                setPadding(0, 8, 0, 40)
            },
        )

        // Área que troca: a lista de recursos, ou o controle de um deles.
        val palco = FrameLayout(act).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f,
            )
        }
        val lista = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL }

        for (r in recursos(act)) {
            lista.addView(botaoDeRecurso(act, r) {
                // A MEDIÇÃO VEM ANTES DA AÇÃO, e não depois.
                //
                // Câmera e YouTube trocam de app: se a gravação viesse depois, o
                // processo já poderia estar em segundo plano e o toque se perderia
                // — justo os dois recursos mais procurados da vitrine.
                medir(act, r.chave)
                r.abrir(act, vitrine) { controle ->
                    palco.removeAllViews()
                    palco.addView(controle)
                }
            })
        }
        palco.addView(lista)
        root.addView(palco)

        root.addView(
            Button(act).apply {
                text = "Voltar"
                setBackgroundColor(act.getColor(R.color.marca_verde))
                setTextColor(act.getColor(R.color.marca_preto))
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                )
                setOnClickListener { aoFechar() }
            },
        )
        return root
    }

    private fun botaoDeRecurso(
        act: Activity,
        r: Recurso,
        aoTocar: () -> Unit,
    ): View = LinearLayout(act).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(32, 28, 32, 28)
        setBackgroundColor(Color.parseColor("#141414"))
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = 20 }
        isClickable = true
        addView(
            TextView(act).apply {
                text = r.rotulo
                textSize = 18f
                setTextColor(act.getColor(R.color.marca_claro))
            },
        )
        addView(
            TextView(act).apply {
                text = r.descricao
                textSize = 13f
                setTextColor(act.getColor(R.color.marca_cinza))
            },
        )
        setOnClickListener { aoTocar() }
    }

    // ── Recursos que acontecem dentro do painel ───────────────────────────────

    /**
     * Brilho da tela.
     *
     * Pedido do Gabriel, e hoje é inalcançável na loja: a barra de notificações
     * está fechada pelo quiosque e os Ajustes não abrem. Sendo dono do aparelho,
     * dá para escrever direto (medido no Razr: escrito 40, lido 40, restaurado).
     *
     * O modo automático precisa sair junto, senão o sensor de luz desfaz o que a
     * pessoa acabou de escolher e o controle parece quebrado.
     */
    private fun controleDeBrilho(act: Activity, vitrine: VitrineParaTeste): View {
        // A BARRA ABRE CHEIA PORQUE A TELA ESTÁ CHEIA.
        //
        // Antes ela lia o ajuste do sistema e abria em 72% com a tela no máximo:
        // neste Android o ajuste de 0 a 255 é espelho de um float interno, e o
        // sistema o reescreve por conta própria (ver Kiosk.brilhoDaJanela). A
        // barra mostrava o espelho, não a tela — e quem arrastasse até o topo não
        // veria mudança nenhuma, porque a janela já estava em 1.0.
        //
        // Agora o controle mexe na JANELA, o mesmo lugar onde a vitrine trava o
        // brilho. O que a barra diz e o que o olho vê passam a ser a mesma coisa.
        //
        // Não persiste nada, de propósito: é um teste. O brilho volta ao máximo
        // sozinho quando a vitrine reaparece, por voltarParaVitrine.
        // O vídeo entra MUDO: aqui o cliente está julgando a tela, e som que ele
        // não pediu numa loja é constrangimento, não demonstração.
        return comVideoAtras(act, vitrine.vista(comSom = false)) {
            controleDeslizante(act, "Brilho da tela", BRILHO_CHEIO, BRILHO_CHEIO) { valor ->
                Kiosk.brilhoDaJanela(act, valor / BRILHO_CHEIO.toFloat())
            }
        }
    }

    /** Topo da barra de brilho. O número não importa: é uma escala visual. */
    private const val BRILHO_CHEIO = 255

    /**
     * Volume do alto-falante.
     *
     * Mexe no volume de mídia do próprio aparelho, que é o que sai quando o
     * cliente toca um vídeo. O volume da vitrine continua sendo decidido no
     * painel da operação — aqui é o cliente ouvindo o aparelho, não a campanha
     * ganhando som sozinha.
     */
    private fun controleDeVolume(act: Activity, vitrine: VitrineParaTeste): View {
        val am = act.getSystemService(Activity.AUDIO_SERVICE) as AudioManager
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val atual = am.getStreamVolume(AudioManager.STREAM_MUSIC)
        // Aqui o vídeo entra COM SOM: é o único jeito de ouvir o alto-falante.
        // Quem devolve a vitrine ao silêncio é o próprio painel, ao sair — ver
        // `montar`, onDetachedFromWindow.
        return comVideoAtras(act, vitrine.vista(comSom = true)) {
            controleDeslizante(act, "Som", atual, max) { valor ->
                try {
                    am.setStreamVolume(AudioManager.STREAM_MUSIC, valor, 0)
                } catch (_: Exception) {
                }
            }
        }
    }

    /**
     * Põe o vídeo da campanha atrás do controle.
     *
     * O controle fica embaixo, numa faixa escura, para o dedo não cobrir
     * justamente a tela que se está avaliando. Sem vídeo carregado (aparelho
     * recém-instalado, campanha ainda baixando), mostra só o controle — que é
     * pior do que com vídeo, mas melhor do que uma tela de erro na loja.
     */
    private fun comVideoAtras(act: Activity, video: View?, controle: () -> View): View {
        if (video == null) return controle()
        return FrameLayout(act).apply {
            addView(
                video,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                ),
            )
            addView(
                controle().apply {
                    setBackgroundColor(Color.parseColor("#CC000000"))
                    setPadding(40, 32, 40, 32)
                },
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply { gravity = Gravity.BOTTOM },
            )
        }
    }

    private fun controleDeslizante(
        act: Activity,
        titulo: String,
        inicial: Int,
        maximo: Int,
        aoMudar: (Int) -> Unit,
    ): View = LinearLayout(act).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER_VERTICAL
        addView(
            TextView(act).apply {
                text = titulo
                textSize = 18f
                setTextColor(act.getColor(R.color.marca_claro))
                setPadding(0, 0, 0, 24)
            },
        )
        addView(
            SeekBar(act).apply {
                max = maximo
                progress = inicial.coerceIn(0, maximo)
                setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                    override fun onProgressChanged(s: SeekBar?, v: Int, doUsuario: Boolean) {
                        if (doUsuario) aoMudar(v)
                    }

                    override fun onStartTrackingTouch(s: SeekBar?) {}
                    override fun onStopTrackingTouch(s: SeekBar?) {}
                })
            },
        )
    }

    // ── Otimização de RAM ─────────────────────────────────────────────────────

    /**
     * A tela de Otimização de RAM, descoberta NO APARELHO.
     *
     * ── Por que existe (levantado na Casas Bahia Interlagos, 18/08) ───────────
     * É um dos recursos que a loja mais demonstra, e o caminho dele é fundo:
     * Ajustes, rolar, achar. Um botão aqui resolve em um toque — e é o mesmo
     * motivo de câmera e YouTube já estarem nesta lista.
     *
     * ── Por que descobrir em vez de escrever o nome ───────────────────────────
     * Cada linha da Motorola batiza esta tela de um jeito, e o nome muda entre
     * versões de Android. Nome fixo no código funcionaria no aparelho onde foi
     * testado e falharia calado no resto da frota — que é o pior defeito
     * possível numa vitrine: o botão existe, o cliente toca, nada acontece.
     *
     * Aqui a lista de telas do próprio aparelho é lida e o nome é procurado.
     * Achou, o botão aparece; não achou, o botão não existe. Aparelho de 16 GB
     * não oferece o recurso, e nesses o painel simplesmente não mostra a opção
     * — melhor do que mostrar um botão que não leva a lugar nenhum.
     *
     * Os pedaços procurados são específicos de propósito: "ram" sozinho casaria
     * com "Program", "Parameter" e outras dezenas de telas.
     */
    /**
     * Onde a tela pode morar. NÃO é dentro dos Ajustes.
     *
     * Medido no Razr 60 Ultra com a tela aberta na mão: ela é
     * `com.motorola.appforecast/.ui.activity.ZRamSettingsActivity` — pacote
     * próprio, sem ícone, invisível para quem procura no lugar óbvio. Eu tinha
     * varrido só `com.android.settings` e concluído que o aparelho não oferecia
     * o recurso; o Gabriel abriu a tela e mostrou que oferecia.
     *
     * Os Ajustes ficam na lista mesmo assim: outra linha da Motorola pode
     * hospedar a tela lá, e procurar nos dois custa nada.
     */
    /**
     * Onde procurar primeiro. Sao os que ja vimos hospedando a tela; o resto da
     * busca cobre o que ainda nao vimos.
     */
    private val PACOTES_COM_RAM = listOf(
        "com.motorola.appforecast",
        "com.android.settings",
    )

    /**
     * Pedaços de nome que identificam a tela. Específicos de propósito: "ram"
     * sozinho casaria com "Program", "Parameter" e dezenas de telas inocentes.
     * `zram` é o nome real no Razr (compressão de memória).
     */
    private val PISTAS_DE_RAM = listOf(
        "zram", "ramboost", "rambooster", "ramopt", "ramexpan", "ramplus",
        "memoryopt", "memoryexpan", "memoryextens", "virtualram", "extendedram",
    )

    /**
     * A tela de Otimização de RAM, descoberta NO APARELHO.
     *
     * ── Por que existe (levantado na Casas Bahia Interlagos, 18/08) ───────────
     * É um dos recursos que a loja mais demonstra, e o caminho até ele é fundo.
     * Um botão aqui resolve em um toque — mesmo motivo de câmera e YouTube já
     * estarem nesta lista.
     *
     * ── Por que descobrir em vez de escrever o nome ───────────────────────────
     * Cada linha da Motorola batiza esta tela de um jeito, e o pacote que a
     * hospeda muda junto. Nome fixo funcionaria no aparelho onde foi testado e
     * falharia calado no resto da frota — o pior defeito possível numa vitrine:
     * o botão existe, o cliente toca, nada acontece.
     *
     * Achou, o botão aparece; não achou, o botão não existe. Aparelho que não
     * oferece o recurso simplesmente não mostra a opção.
     */
    fun telaDeOtimizacaoDeRam(ctx: android.content.Context): Intent? {
        val achado = ondeMoraARam(ctx) ?: return null
        val corte = achado.lastIndexOf('/')
        if (corte <= 0) return null
        return Intent().setClassName(achado.substring(0, corte), achado.substring(corte + 1))
    }

    /**
     * "pacote/classe" da tela de RAM, ou null se este aparelho nao tem.
     *
     * ── Por que varre em vez de conferir uma lista ────────────────────────────
     * A lista fixa funcionou no Razr (com.motorola.appforecast) e NAO funcionou
     * nos Moto G: o botao simplesmente nao aparecia, e nem dava para descobrir o
     * pacote de longe — a tela nao tem icone, entao ela nao entra no inventario
     * que o aparelho manda ao painel. Sem o aparelho na mao, era chute.
     *
     * Agora a busca comeca pelos conhecidos e, se nao achar, varre os pacotes da
     * PROPRIA fabricante mais os Ajustes. Sao algumas dezenas, nao o aparelho
     * inteiro: pedir a lista de activities de 200 pacotes estoura o limite de
     * transacao do Android.
     *
     * ── Guardado depois de resolvido ──────────────────────────────────────────
     * O resultado nao muda enquanto o aparelho for o mesmo, e o painel abre a
     * cada primeiro toque do cliente. Varrer toda vez seria pagar a busca em
     * cima de alguem esperando a tela aparecer.
     */
    fun ondeMoraARam(ctx: android.content.Context): String? {
        Prefs.telaDeRam(ctx)?.let { return it.ifEmpty { null } }

        val pm = ctx.packageManager
        fun procurar(pacote: String): String? = try {
            pm.getPackageInfo(pacote, android.content.pm.PackageManager.GET_ACTIVITIES)
                .activities
                ?.firstOrNull { a ->
                    val nome = a.name.lowercase()
                    a.exported && PISTAS_DE_RAM.any { nome.contains(it) }
                }
                ?.let { "$pacote/${it.name}" }
        } catch (_: Exception) {
            null
        }

        for (pacote in PACOTES_COM_RAM) {
            procurar(pacote)?.let {
                Prefs.setTelaDeRam(ctx, it)
                return it
            }
        }

        val candidatos = try {
            pm.getInstalledPackages(0)
                .map { it.packageName }
                .filter { it.startsWith("com.motorola") || it.startsWith("com.android.settings") }
                .filter { it !in PACOTES_COM_RAM }
        } catch (_: Exception) {
            emptyList()
        }
        for (pacote in candidatos) {
            procurar(pacote)?.let {
                Prefs.setTelaDeRam(ctx, it)
                return it
            }
        }

        // Guarda o "nao tem" também: sem isso, aparelho sem o recurso pagaria a
        // varredura inteira a cada abertura do painel.
        Prefs.setTelaDeRam(ctx, "")
        return null
    }

    /** O pacote que hospeda a tela, para o quiosque autorizá-lo. */
    fun pacoteDaOtimizacaoDeRam(ctx: android.content.Context): String? =
        telaDeOtimizacaoDeRam(ctx)?.component?.packageName

    // ── Abrir app do sistema ──────────────────────────────────────────────────

    private fun abrirPorIntent(act: Activity, intent: Intent) {
        try {
            act.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {
            // App ausente neste aparelho: o painel continua aberto, e o cliente
            // escolhe outra coisa. Falhar em silêncio é melhor do que uma
            // mensagem de erro do Android na vitrine.
        }
    }

    private fun abrirPorPacote(act: Activity, pacote: String) {
        val intent = try {
            act.packageManager.getLaunchIntentForPackage(pacote)
        } catch (_: Exception) {
            null
        } ?: return
        abrirPorIntent(act, intent)
    }

    // ── A medição ─────────────────────────────────────────────────────────────

    /**
     * Um toque num recurso vira um evento.
     *
     * Escrito na fila local, igual a todo o resto: a loja pode estar sem rede no
     * momento do toque, e um dado de venda não pode depender disso. Sai na
     * próxima leva que passar.
     *
     * O identificador leva o instante do toque, então o mesmo toque nunca entra
     * duas vezes — e dois toques no mesmo recurso no mesmo segundo (cliente
     * ansioso, dedo duplo) viram um só, que é o certo: foi uma intenção.
     */
    private fun medir(act: Activity, chave: String) {
        try {
            val agora = System.currentTimeMillis()
            val quando = iso.format(Date(agora))
            EventQueue(act).use { fila ->
                fila.add(
                    eventId = "recurso:$chave:${agora / 1000}",
                    kind = "feature_tap",
                    pkg = "linka:$chave",
                    startedAt = quando,
                    endedAt = quando,
                    durationSeconds = 0L,
                )
            }
        } catch (_: Exception) {
            // Medição nunca pode derrubar a experiência: o cliente está com o
            // aparelho na mão, e o recurso importa mais que o dado.
        }
    }
}
