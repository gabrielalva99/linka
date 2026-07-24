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
    const val AGENT_VERSION = "0.4.0"

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

    fun provision(code: String, serial: String, osVersion: String): Result {
        val body = JSONObject()
            .put("provisioning_code", code)
            .put("serial", serial)
            .put("os_version", osVersion)
            .put("agent_version", AGENT_VERSION)
            .put("platform", "android")
        return post("agent-provision", body)
    }

    fun content(token: String): Result {
        return post("agent-content", JSONObject(), token)
    }

    fun heartbeat(
        token: String,
        batteryLevel: Int,
        charging: Boolean,
        osVersion: String,
        playingUrl: String?,
        playingFit: String?,
    ): Result {
        val body = JSONObject()
            .put("status", "online")
            .put("mode", "show")
            .put("battery_level", batteryLevel)
            .put("battery_charging", charging)
            .put("os_version", osVersion)
            .put("agent_version", AGENT_VERSION)
            .put("playing_url", playingUrl ?: JSONObject.NULL)
            .put("playing_fit", playingFit ?: JSONObject.NULL)
        return post("agent-heartbeat", body, token)
    }
}
