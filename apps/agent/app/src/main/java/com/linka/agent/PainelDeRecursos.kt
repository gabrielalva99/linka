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
    private val RECURSOS = listOf(
        Recurso("camera", "Câmera", "Tire uma foto") { act, _, _ ->
            abrirPorIntent(act, Intent("android.media.action.STILL_IMAGE_CAMERA"))
        },
        Recurso("youtube", "YouTube", "Veja em alta resolução") { act, _, _ ->
            abrirPorPacote(act, "com.google.android.youtube")
        },
        Recurso("brilho", "Brilho da tela", "Veja o vídeo mudar") { act, vitrine, mostrar ->
            mostrar(controleDeBrilho(act, vitrine))
        },
        Recurso("volume", "Som", "Ouça o alto-falante") { act, vitrine, mostrar ->
            mostrar(controleDeVolume(act, vitrine))
        },
    )

    /**
     * Monta a tela do painel.
     *
     * `aoFechar` devolve a vitrine. Quem chama decide o que isso significa — aqui
     * dentro não se sabe (nem se deve saber) como o vídeo é remontado.
     */
    fun montar(act: Activity, vitrine: VitrineParaTeste, aoFechar: () -> Unit): View {
        val root = object : LinearLayout(act) {
            /**
             * SAIU DO PAINEL: a vitrine volta ao silêncio, sempre.
             *
             * O teste de som liga o áudio do vídeo, e desligar no botão "Voltar"
             * não bastaria — o painel também morre pelo retorno automático, pela
             * troca de vídeo da campanha e pela tela sendo recriada pelo Android.
             * Qualquer um desses caminhos deixaria a vitrine gritando na loja
             * depois que o cliente foi embora, e ninguém no painel saberia.
             *
             * `onDetachedFromWindow` é o único ponto por onde TODOS eles passam.
             */
            override fun onDetachedFromWindow() {
                super.onDetachedFromWindow()
                vitrine.devolverSilencio()
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
             */
            override fun dispatchTouchEvent(ev: android.view.MotionEvent): Boolean {
                Prefs.setLeftAt(act, System.currentTimeMillis())
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

        for (r in RECURSOS) {
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
        try {
            Kiosk.escreverAjusteDoSistema(
                act, Settings.System.SCREEN_BRIGHTNESS_MODE,
                Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL.toString(),
            )
        } catch (_: Exception) {
        }
        val atual = try {
            Settings.System.getInt(act.contentResolver, Settings.System.SCREEN_BRIGHTNESS)
        } catch (_: Exception) {
            128
        }
        // O vídeo entra MUDO: aqui o cliente está julgando a tela, e som que ele
        // não pediu numa loja é constrangimento, não demonstração.
        return comVideoAtras(act, vitrine.vista(comSom = false)) {
            controleDeslizante(act, "Brilho da tela", atual, 255) { valor ->
                Kiosk.escreverAjusteDoSistema(
                    act, Settings.System.SCREEN_BRIGHTNESS, valor.toString(),
                )
            }
        }
    }

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
