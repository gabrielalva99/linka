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

    /**
     * QUANDO a tentativa em curso comecou (0 = nenhuma).
     *
     * Era um booleano, e isso prendia o aparelho para sempre: a flag pertence ao
     * objeto e vive enquanto o processo viver, entao uma thread de download
     * pendurada deixava `running` em true e TODA chamada seguinte voltava na
     * primeira linha — sem baixar, sem gravar estado, sem erro. Um aparelho
     * parado numa versao velha, calado, ate alguem reiniciar o app.
     *
     * Rede que entrega bytes bem devagar nao dispara o tempo-limite de leitura:
     * cada pedaco chega dentro do prazo, e a copia inteira nunca termina. Foi o
     * que aconteceu com um Moto G06 e um Moto G17 na Casas Bahia (19/08): a
     * frota subiu para a 0.90.0 e os dois ficaram na 0.88.0, sem nada no painel.
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

    fun maybeUpdate(ctx: Context, version: String, url: String) {
        if (version.isEmpty() || url.isEmpty()) return
        if (!isNewer(version, Api.AGENT_VERSION)) {
            // Já estamos nesta versão (ou à frente): esquece falhas anteriores.
            Prefs.clearUpdateFailure(ctx)
            return
        }
        if (!Kiosk.isDeviceOwner(ctx)) return

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
            Prefs.setUpdateError(
                ctx,
                "Instalação da versão $version recusada $tentativas vezes. " +
                    "provável assinatura diferente. Precisa de passagem por cabo.",
            )
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
        Prefs.setUpdateState(
            ctx,
            "baixando $version (tentativa ${tentativas + 1} de $MAX_TENTATIVAS)",
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
