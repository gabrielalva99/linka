package com.linka.agent

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter

/**
 * O aparelho conta quando quebra.
 *
 * Até aqui, app que travava numa loja era invisível: o painel dizia "fora do ar"
 * e ninguém sabia se era energia, rede, aparelho recolhido ou defeito nosso. Com
 * 250 aparelhos, a diferença entre essas hipóteses é uma viagem.
 *
 * COMO SOBREVIVE AO PRÓPRIO ACIDENTE. O que roda aqui roda com o processo já
 * morrendo: qualquer coisa que possa falhar, falha. Então a captura faz só o
 * mínimo — monta um texto e grava num arquivo, síncrono, sem rede, sem banco,
 * sem thread nova. Rede no meio de um crash é a forma mais confiável de perder o
 * relato do crash.
 *
 * O envio acontece na execução SEGUINTE, quando o app volta e está inteiro. Se o
 * aparelho ficar dois dias sem rede, o arquivo espera.
 *
 * E o handler anterior é sempre chamado no fim. Sem isso o Android não mostra o
 * "o app parou" nem reinicia a tarefa — o aparelho ficaria com a tela morta em
 * vez de voltar para a vitrine, que é o oposto do que se quer numa loja.
 */
object CrashLog {

    private const val ARQUIVO = "linka-quedas.json"

    /** Teto de quedas guardadas. Um defeito em laço não pode encher o disco. */
    private const val MAX_GUARDADAS = 20

    /** Pilha cortada: o topo é o que identifica o defeito; o resto é ruído. */
    private const val MAX_PILHA = 4000

    fun instalar(ctx: Context) {
        val anterior = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, erro ->
            try {
                gravar(ctx, erro)
            } catch (_: Throwable) {
                // Engolir é proposital, e é a única vez que isto se justifica: uma
                // falha AO REGISTRAR a falha não pode impedir o Android de fazer o
                // que faria — mostrar o aviso e levantar a vitrine de volta.
            }
            anterior?.uncaughtException(thread, erro)
        }
    }

    private fun gravar(ctx: Context, erro: Throwable) {
        val pilha = StringWriter().also { erro.printStackTrace(PrintWriter(it)) }.toString()

        val queda = JSONObject()
            .put("tipo", erro.javaClass.name)
            .put("mensagem", erro.message?.take(500) ?: "")
            .put("pilha", pilha.take(MAX_PILHA))
            .put("fingerprint", impressao(erro, pilha))
            .put("agent_version", Api.AGENT_VERSION)
            .put("os_version", android.os.Build.VERSION.RELEASE ?: "")
            .put("ocorreu_em", System.currentTimeMillis())

        val arq = File(ctx.filesDir, ARQUIVO)
        val lista = ler(arq)
        lista.put(queda)
        // Descarta as mais antigas: num defeito repetitivo, as últimas contam a
        // mesma história e as primeiras já foram enviadas.
        val recortada = JSONArray()
        val inicio = maxOf(0, lista.length() - MAX_GUARDADAS)
        for (i in inicio until lista.length()) recortada.put(lista.get(i))
        arq.writeText(recortada.toString())
    }

    /**
     * A identidade do defeito.
     *
     * Tipo da exceção mais a primeira linha da pilha que é NOSSA. Sem esse
     * recorte, todo erro que passa por dentro do Android teria a mesma cara, e
     * dois defeitos diferentes viveriam somados. É o que permite ao painel dizer
     * "este mesmo erro em 12 aparelhos" em vez de listar quarenta ocorrências.
     */
    private fun impressao(erro: Throwable, pilha: String): String {
        val nossa = pilha.lineSequence()
            .map { it.trim() }
            .firstOrNull { it.startsWith("at com.linka.agent") }
            ?: erro.stackTrace.firstOrNull()?.toString()
            ?: ""
        return "${erro.javaClass.simpleName}|${nossa.take(160)}"
    }

    private fun ler(arq: File): JSONArray =
        try {
            if (arq.exists()) JSONArray(arq.readText()) else JSONArray()
        } catch (_: Throwable) {
            // Arquivo ilegível não pode impedir o registro da queda de agora:
            // recomeça, em vez de perder também esta.
            JSONArray()
        }

    /** As quedas guardadas, para irem junto com a próxima batida. Null se não há. */
    fun pendentes(ctx: Context): JSONArray? {
        val arq = File(ctx.filesDir, ARQUIVO)
        val lista = ler(arq)
        return if (lista.length() > 0) lista else null
    }

    /**
     * Só apaga DEPOIS que o servidor confirmou.
     *
     * Apagar ao enviar perderia o relato numa queda de rede — e queda de rede é
     * justamente o que costuma acompanhar um aparelho com problema.
     */
    fun limpar(ctx: Context) {
        try {
            File(ctx.filesDir, ARQUIVO).delete()
        } catch (_: Throwable) {
        }
    }
}
