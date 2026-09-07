package com.linka.agent

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.app.PendingIntent
import android.os.Build
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Atualização do app sem cabo.
 *
 * 250 aparelhos em 15 lojas não voltam para a bancada a cada correção. Como
 * device owner, o Android permite instalar em silêncio — sem ninguém tocar em
 * "permitir".
 *
 * ── E QUANDO NÃO SE É DONO DO APARELHO (a TV) ───────────────────────────────
 * Até 07/09 esta era a única porta, e ela fechava: sem dono, o agente
 * simplesmente não atualizava. Isso valia enquanto a frota era só de mão, onde
 * o cargo de dono sempre existe. O box Android TV quebrou a premissa — a build
 * dele não tem `device_admin`, então ele nunca será dono, e uma TV em loja
 * ficaria congelada para sempre na versão com que foi instalada.
 *
 * O Android tem uma segunda porta desde a 12 (API 31): instalar em silêncio
 * sem ser dono, se o app declarar `UPDATE_PACKAGES_WITHOUT_USER_ACTION`, tiver
 * `REQUEST_INSTALL_PACKAGES` **concedida** e estiver atualizando A SI MESMO.
 * É o caso exato daqui. Ver [podeInstalarEmSilencio].
 *
 * A ordem importa: dono do aparelho continua sendo o caminho preferido em
 * aparelho de mão, e a segunda porta é o que salva a TV — e vira plano B do dia
 * em que um celular perder o cargo de dono em loja.
 */
object SelfUpdate {

    /**
     * A segunda porta: dá para instalar sem confirmação na tela?
     *
     * Duas condições, e as duas precisam ser verdadeiras em tempo de execução:
     * o sistema é Android 12 ou mais (antes disso `setRequireUserAction` nem
     * existe), e o appop de instalar aplicativos está concedido.
     *
     * `canRequestPackageInstalls()` pergunta pelo APPOP, não pela declaração no
     * manifesto. É a diferença que decide: declarar não concede nada, e um box
     * preparado errado responde `false` aqui — que é exatamente o que o painel
     * precisa saber, em vez de descobrir meses depois que a loja está velha.
     */
    fun podeInstalarEmSilencio(ctx: Context): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            ctx.packageManager.canRequestPackageInstalls()

    /**
     * QUANDO a tentativa em curso comecou (0 = nenhuma).
     *
     * Era um booleano, e isso segurava as tentativas seguintes enquanto uma
     * thread de download estivesse pendurada: a flag pertence ao objeto e vive
     * com o processo, entao toda chamada nova voltava na primeira linha — sem
     * baixar, sem gravar estado, sem erro.
     *
     * Rede que entrega bytes bem devagar nao dispara o tempo-limite de leitura:
     * cada pedaco chega dentro do prazo, e a copia demora muito mais do que
     * deveria. Foi o que aconteceu com um Moto G06 e um Moto G17 na Casas Bahia
     * (19/08): a frota subiu para a 0.90.0 e os dois ficaram na 0.88.0 por cerca
     * de uma hora, sem nada no painel.
     *
     * ── O QUE ISTO NAO E, e vale registrar ────────────────────────────────────
     * Nao era travamento permanente. Eu diagnostiquei como tal e estava errado:
     * os dois se resolveram sozinhos, sem reinicio, quando a thread terminou e a
     * rede de seguranca de 30 minutos pediu conteudo de novo. O conserto aqui
     * encurta essa janela e — mais importante — faz o aparelho CONTAR que esta
     * naquele estado, em vez de sumir do radar enquanto espera.
     */
    @Volatile
    private var rodandoDesde = 0L

    /** Tentativa mais velha que isto e considerada morta, e outra pode comecar. */
    private const val TENTATIVA_EXPIRA_MS = 10 * 60_000L

    /**
     * Só instala versão MAIS NOVA. Comparar por "diferente" fazia um aparelho que
     * já estava adiante (build de teste em campo) tentar rebaixar para a versão
     * publicada — o Android recusa e o aparelho tentaria de novo para sempre,
     * baixando 5 MB a cada 20 segundos.
     */
    private fun isNewer(candidate: String, current: String): Boolean {
        val a = candidate.split(".").map { it.toIntOrNull() ?: 0 }
        val b = current.split(".").map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(a.size, b.size)) {
            val x = a.getOrElse(i) { 0 }
            val y = b.getOrElse(i) { 0 }
            if (x != y) return x > y
        }
        return false
    }

    /**
     * Quantas vezes tentar antes de desistir de uma versão.
     *
     * Instalação pode ser recusada de forma permanente — a mais comum é assinatura
     * diferente da que já está no aparelho. Sem limite, o aparelho baixaria o APK
     * a cada 20 segundos para sempre: em 250 aparelhos, é o chip 5G das lojas
     * torrado por um erro de publicação.
     */
    private const val MAX_TENTATIVAS = 3

    /**
     * Volta para a atualização que ficou esperando a vez.
     *
     * Chamado pelo relógio de 60 segundos do serviço. Sem argumentos de propósito:
     * o serviço não conhece versão nem endereço — quem sabe é o que ficou gravado
     * na última resposta de conteúdo.
     *
     * Barato quando não há nada: uma leitura de preferência e volta. Quando há, cai
     * no mesmo `maybeUpdate` de sempre, com as mesmas travas (tentativas, download
     * em curso, manutenção, quiosque e a vez sorteada). Não é um segundo caminho de
     * atualização — é o mesmo caminho, alcançável de minuto em minuto.
     */
    fun retomarPendente(ctx: Context) {
        val (version, url) = Prefs.atualizacaoPendente(ctx) ?: return
        maybeUpdate(ctx, version, url)
    }

    fun maybeUpdate(ctx: Context, version: String, url: String) {
        if (version.isEmpty() || url.isEmpty()) return
        if (!isNewer(version, Api.AGENT_VERSION)) {
            // Já estamos nesta versão (ou à frente): esquece falhas anteriores.
            Prefs.clearUpdateFailure(ctx)
            return
        }
        // DUAS PORTAS, e basta uma. Dono do aparelho (frota de mão) ou o appop
        // de instalação concedido (a TV, que nunca vira dona). Sem nenhuma das
        // duas, sair aqui continua sendo o certo: o painel mostra a versão velha,
        // que é honesto, em vez de deixar um diálogo de "permitir" pendurado numa
        // vitrine onde ninguém vai clicar.
        if (!Kiosk.isDeviceOwner(ctx) && !podeInstalarEmSilencio(ctx)) return

        // GUARDA O QUE ESTÁ PENDENTE, para o relógio de 60s poder voltar aqui.
        //
        // Daqui para baixo existem três saídas que só ADIAM: manutenção aberta,
        // vitrine fora do quiosque, e a vez sorteada que ainda não chegou. Antes
        // desta linha, adiar significava esperar a próxima busca de conteúdo — que
        // é de 30 em 30 minutos, porque publicar versão de propósito NÃO acorda a
        // frota (a versão fica fora do hash de revisão desde o efeito manada da
        // Casas Bahia).
        //
        // O resultado medido em 20/08: o sorteio de até 8 minutos vencia sozinho e
        // o aparelho ficava mais meia hora parado, com "aguardando a vez (74s)"
        // congelado na tela — o número não descia porque ninguém reescrevia a
        // mensagem. Cinco aparelhos assim ao mesmo tempo.
        //
        // Com a pendência gravada, quem age é `retomarPendente` no relógio de 60
        // segundos. O sorteio continua existindo e continua espalhando a carga: a
        // diferença é que agora ele é OBEDECIDO na hora certa, em vez de vencer no
        // vazio e cobrar mais um ciclo.
        Prefs.setAtualizacaoPendente(ctx, version, url)

        // ESPERA a vitrine estar presa no app. Este e o conserto de uma regressao
        // que o Gabriel notou: "algumas atualizacoes atras o app piscava 1 segundo
        // e ja voltava para o video".
        //
        // Instalar mata o processo, sempre. O que muda e o que o Android levanta
        // depois:
        //
        //   COM lock task  - ele restaura a tarefa presa, e a vitrine volta em ~1s
        //                    sem passar por tela nenhuma. Medido no aparelho.
        //   SEM lock task  - ele pede a tela inicial, e nestes aparelhos quem
        //                    responde e o launcher da Motorola. A vitrine sai do ar
        //                    e volta so pelo MY_PACKAGE_REPLACED, depois de alguns
        //                    segundos de menu de apps na cara do cliente.
        //
        // Fora do quiosque o aparelho esta em manutencao ou na mao de um cliente
        // testando a camera. Nos dois casos, instalar agora e interromper alguem
        // para mostrar o launcher. A versao nova nao tem pressa: ela entra na
        // proxima volta, quando a vitrine estiver de novo no lugar dela.
        //
        // A espera vem ANTES da contagem de tentativas de proposito: adiar nao e
        // falhar, e gastar tentativa aqui faria uma versao boa ser declarada
        // "recusada, precisa de cabo" so porque alguem mexeu no aparelho.
        if (Prefs.emManutencao(ctx)) return
        if (!Kiosk.lockTaskOn(ctx)) return

        val tentativas = Prefs.updateAttempts(ctx, version)
        if (tentativas >= MAX_TENTATIVAS) {
            // NAO CHUTA MAIS A CAUSA. A versao anterior afirmava "provavel
            // assinatura diferente" e mandava passar cabo — e no unico caso real
            // isso era falso, com quatro aparelhos ja rodando a mesma versao. O
            // motivo verdadeiro, quando o Android informa, esta no update_state.
            Prefs.setUpdateError(
                ctx,
                "Não consegui instalar a versão $version em $tentativas tentativas. " +
                    (Prefs.updateState(ctx)?.let { "Último retorno do aparelho: $it" }
                        ?: "O aparelho não informou o motivo."),
            )
            // DESISTIU: apaga a pendência para o relógio de 60s parar de voltar aqui.
            //
            // Sem isto, o aparelho que esgotou as três tentativas reescreveria esta
            // mesma mensagem de erro no disco a cada minuto, para sempre — gravação
            // inútil no aparelho mais fraco da frota, justamente o que mais falha.
            //
            // Não é perda: desistir é estado final por versão. Versão nova publicada
            // chega pela busca de conteúdo, zera a contagem e grava a pendência de
            // novo; e o "tentar de novo" do painel age pelo mesmo caminho.
            Prefs.setAtualizacaoPendente(ctx, "", "")
            return
        }
        // A trava vem ANTES da contagem, e a ordem inversa era um defeito.
        //
        // Contando primeiro, cada consulta de 20 segundos gastava uma tentativa —
        // inclusive as que só encontravam um download já em curso e voltavam sem
        // fazer nada. Um APK de 3,7 MB no Wi-Fi de loja passa de 20 segundos, então
        // uma atualização perfeitamente saudável queimava as três tentativas antes
        // de terminar e era declarada "recusada, precisa de cabo".
        //
        // Agora conta quem realmente vai baixar. A tentativa continua sendo contada
        // ANTES do download (e não depois): se o processo morrer no meio da
        // instalação, ela tem que contar, senão um APK que derruba o app na
        // instalação viraria laço infinito.
        // ── A FROTA NAO BAIXA TODA DE UMA VEZ ────────────────────────────────
        //
        // Publicar avisa todos os aparelhos ao mesmo tempo, e ate agora todos
        // saiam correndo para o mesmo arquivo no mesmo segundo. Numa loja com 13
        // aparelhos isso ja da 64 MB simultaneos na mesma wi-fi; em 19/08, seis
        // deles levaram SocketTimeoutException na mesma publicacao, e eu passei a
        // tarde procurando defeito em aparelho individual. O defeito era a
        // largada em bloco.
        //
        // Com 250 aparelhos numa rede de loja, isso deixa de ser lentidao e vira
        // a rede inteira parada — inclusive para o que a loja precisa dela.
        //
        // Cada aparelho sorteia um atraso e o GUARDA: sorteio novo a cada batida
        // faria o aparelho adiar para sempre, sem nunca chegar a hora. O atraso
        // vale por versao, entao versao nova recomeca a fila.
        // VERSAO NOVA APAGA O FRACASSO DA ANTERIOR.
        //
        // O contador de tentativas ja era por versao, mas a MENSAGEM de
        // desistencia ficava gravada. Resultado visto no painel (19/08): um Moto
        // G max exibindo "Instalacao da versao 0.98.0 recusada 3 vezes, precisa
        // de passagem por cabo" enquanto baixava a 0.99.0 sem nenhum problema.
        // Alerta que sobrevive ao proprio assunto vira alerta que ninguem le.
        if (Prefs.updateAttempts(ctx, version) == 0 && Prefs.updateError(ctx) != null) {
            Prefs.setUpdateState(ctx, null)
            Prefs.limparSoOErro(ctx)
        }

        val espera = Prefs.esperaDaAtualizacao(ctx, version)
        if (System.currentTimeMillis() < espera) {
            val faltam = (espera - System.currentTimeMillis()) / 1000
            Prefs.setUpdateState(ctx, "aguardando a vez para baixar $version (${faltam}s)")
            return
        }

        val agora = System.currentTimeMillis()
        synchronized(this) {
            val emCurso = rodandoDesde
            if (emCurso != 0L && agora - emCurso < TENTATIVA_EXPIRA_MS) {
                // Ja tem uma tentativa viva. Grava o estado ANTES de sair: era
                // exatamente aqui que o aparelho sumia do radar, voltando sem
                // deixar rastro nenhum.
                Prefs.setUpdateState(
                    ctx,
                    "baixando $version há ${(agora - emCurso) / 1000}s",
                )
                return
            }
            rodandoDesde = agora
        }
        Prefs.setUpdateAttempt(ctx, version, tentativas + 1)
        // CONTA O QUE ESTA FAZENDO. Sem isto o painel so fica sabendo quando o
        // agente DESISTE, e ate la um aparelho parado na versao velha e igual a
        // um aparelho em dia — foi assim que o Moto G06 passou horas atras sem
        // ninguem notar (19/08).
        // COM A HORA DE INICIO, sempre.
        //
        // "baixando" sozinho nao distingue um download que comecou agora de um
        // pendurado ha uma hora — e os dois aparecem identicos na tela. Foi o
        // Gabriel olhando a ficha do G47 as 15:03 que apontou isso: o painel
        // dizia "baixando (tentativa 1 de 3)" e nao havia como saber se aquilo
        // era normal ou travado.
        //
        // Quem le a tela precisa dessa diferenca para decidir se espera ou se
        // age. Vai a hora local do aparelho, que e a hora da loja.
        val relogio = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault())
        Prefs.setUpdateState(
            ctx,
            "baixando $version desde ${relogio.format(java.util.Date(agora))} " +
                "(tentativa ${tentativas + 1} de $MAX_TENTATIVAS)",
        )
        Thread {
            try {
                val apk = download(ctx, url)
                if (apk != null) {
                    Prefs.setUpdateState(ctx, "instalando $version")
                    install(ctx, apk)
                } else {
                    // O motivo vem de dentro do download: so ele sabe se foi rede,
                    // arquivo pela metade ou disco cheio.
                    Prefs.setUpdateState(
                        ctx,
                        (ultimoMotivo ?: "não consegui baixar") +
                            " — versão $version, tentativa ${tentativas + 1} de $MAX_TENTATIVAS",
                    )
                }
            } catch (e: Exception) {
                Prefs.setUpdateState(
                    ctx,
                    "falha ao instalar $version: " + (e.message ?: "erro desconhecido"),
                )
            } finally {
                rodandoDesde = 0L
            }
        }.start()
    }

    /** Por que o ultimo download nao deu certo. Lido logo apos a chamada. */
    @Volatile
    private var ultimoMotivo: String? = null

    private fun download(ctx: Context, url: String): File? {
        ultimoMotivo = null
        val temp = File(ctx.cacheDir, "update.apk.part")
        val target = File(ctx.cacheDir, "update.apk")
        var conn: HttpURLConnection? = null
        try {
            conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 20000
            conn.readTimeout = 120000
            if (conn.responseCode !in 200..299) {
                ultimoMotivo = "servidor respondeu ${conn.responseCode}"
                return null
            }
            val expected = conn.contentLengthLong
            // COPIA COM PRAZO. `readTimeout` cobre cada leitura, nao a soma
            // delas: uma rede que entrega alguns bytes por vez atende todos os
            // prazos individuais e nunca termina. Sem um limite do conjunto, a
            // thread fica pendurada e trava as proximas tentativas.
            val limite = System.currentTimeMillis() + TENTATIVA_EXPIRA_MS
            temp.outputStream().use { out ->
                conn.inputStream.use { entrada ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val lidos = entrada.read(buffer)
                        if (lidos < 0) break
                        out.write(buffer, 0, lidos)
                        if (System.currentTimeMillis() > limite) {
                            ultimoMotivo = "download passou de 10 minutos e foi interrompido"
                            temp.delete()
                            return null
                        }
                    }
                }
            }
            // APK pela metade instalado é aparelho quebrado em loja.
            if (expected > 0 && temp.length() != expected) {
                // Arquivo pela metade: quase sempre rede da loja caindo no meio.
                ultimoMotivo = "download veio incompleto (${temp.length()} de $expected bytes)"
                temp.delete()
                return null
            }
            if (target.exists()) target.delete()
            return if (temp.renameTo(target)) target else null
        } catch (e: Exception) {
            ultimoMotivo = e.javaClass.simpleName + (e.message?.let { ": $it" } ?: "")
            temp.delete()
            return null
        } finally {
            conn?.disconnect()
        }
    }

    /**
     * O QUE O ANDROID DISSE sobre a instalacao.
     *
     * O resultado volta pelo PendingIntent que `install` registra, e ate agora
     * era descartado — o app so sabia "nao instalou". Foi assim que o painel
     * acabou dizendo "provavel assinatura diferente, precisa de passagem por
     * cabo" para um Moto G max em 19/08: um chute meu, escrito quando a
     * tentativa numero tres falhava. Naquele mesmo momento QUATRO aparelhos ja
     * rodavam a versao nova, entao de assinatura nao era nada — e a frase mandava
     * alguem pegar a estrada por engano.
     *
     * Agora o motivo do proprio Android e guardado e sobe para o painel.
     */
    fun anotarResultadoDaInstalacao(ctx: Context, intent: android.content.Intent?) {
        val status = intent?.getIntExtra(PackageInstaller.EXTRA_STATUS, Int.MIN_VALUE)
            ?: return
        if (status == Int.MIN_VALUE) return

        if (status == PackageInstaller.STATUS_SUCCESS) {
            Prefs.clearUpdateFailure(ctx)
            return
        }
        val detalhe = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
        val nome = when (status) {
            PackageInstaller.STATUS_FAILURE_STORAGE -> "sem espaço no aparelho"
            PackageInstaller.STATUS_FAILURE_INCOMPATIBLE -> "pacote incompatível com este aparelho"
            PackageInstaller.STATUS_FAILURE_CONFLICT -> "conflito com o aplicativo já instalado (assinatura)"
            PackageInstaller.STATUS_FAILURE_INVALID -> "arquivo de instalação inválido"
            PackageInstaller.STATUS_FAILURE_ABORTED -> "instalação interrompida"
            PackageInstaller.STATUS_FAILURE_BLOCKED -> "instalação bloqueada pelo sistema"
            else -> "falha $status"
        }
        Prefs.setUpdateState(
            ctx,
            "instalação recusada: $nome" + (detalhe?.let { " ($it)" } ?: ""),
        )
    }

    private fun install(ctx: Context, apk: File) {
        val installer = ctx.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(
            PackageInstaller.SessionParams.MODE_FULL_INSTALL
        )
        // SEM ISTO A SESSÃO PEDE CONFIRMAÇÃO NA TELA, e numa vitrine ninguém
        // clica: o app fica esperando para sempre e a versão nova nunca entra.
        // Como dono do aparelho o Android já dispensa a confirmação, então esta
        // linha é a que faz a TV funcionar. O padrão quando não se diz nada é
        // EXIGIR a confirmação, ou seja, o silêncio aqui era o defeito.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            params.setRequireUserAction(
                PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED
            )
        }
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
