package com.linka.agent

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Cliente HTTP mínimo para os endpoints do agente (sem dependências externas). */
object Api {
    const val BASE = "https://xkzktmsqtvpkxmzftars.supabase.co/functions/v1"
    // Chave pública (anon) — protegida por RLS; segura para embutir no app.
    const val ANON =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhremt0bXNxdHZwa3htemZ0YXJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NTQ3MzksImV4cCI6MjEwMDQzMDczOX0.SdqYO4RAxNr6Z3s-EJVzHJyAdhzXG7t213YHj7P-9D8"
    /**
     * Lida do próprio pacote instalado (versionName do build), não escrita à mão:
     * as duas já divergiram uma vez — o painel dizia 0.10.1 e o Android via 0.1.0,
     * o que estraga tanto o diagnóstico quanto a decisão de atualizar.
     */
    var AGENT_VERSION: String = "0.0.0"
        private set

    fun init(ctx: android.content.Context) {
        AGENT_VERSION = try {
            ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: "0.0.0"
        } catch (_: Exception) {
            "0.0.0"
        }
    }

    /** Como o aparelho se identifica — evita digitar modelo em centenas de aparelhos. */
    val HARDWARE_MODEL: String
        get() {
            val maker = android.os.Build.MANUFACTURER ?: ""
            val model = android.os.Build.MODEL ?: ""
            return if (model.lowercase().startsWith(maker.lowercase())) model
            else "$maker $model".trim()
        }

    data class Result(val code: Int, val body: String)

    private fun post(path: String, payload: JSONObject, bearer: String? = null): Result {
        val conn = URL("$BASE/$path").openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.connectTimeout = 15000
            conn.readTimeout = 15000
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("apikey", ANON)
            if (bearer != null) conn.setRequestProperty("Authorization", "Bearer $bearer")
            conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
            return Result(code, text)
        } finally {
            conn.disconnect()
        }
    }

    fun provision(code: String, androidId: String, osVersion: String): Result {
        val body = JSONObject()
            .put("provisioning_code", code)
            .put("android_id", androidId)
            .put("hardware_model", HARDWARE_MODEL)
            .put("os_version", osVersion)
            .put("agent_version", AGENT_VERSION)
            .put("platform", "android")
        return post("agent-provision", body)
    }

    fun content(token: String): Result {
        return post("agent-content", JSONObject(), token)
    }

    /** O corpo é montado por quem conhece o estado (Telemetry); aqui só assinamos e enviamos. */
    fun heartbeat(token: String, body: JSONObject): Result {
        body.put("agent_version", AGENT_VERSION)
        body.put("hardware_model", HARDWARE_MODEL)
        return post("agent-heartbeat", body, token)
    }
}
