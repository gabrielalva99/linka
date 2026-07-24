package com.linka.agent

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject

class MainActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1)
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(56, 120, 56, 56)
        }
        val title = TextView(this).apply {
            text = "LINKA — Agente"
            textSize = 26f
        }
        val status = TextView(this).apply {
            textSize = 16f
            setPadding(0, 40, 0, 0)
        }

        val existing = Prefs.token(this)
        if (existing != null) {
            status.text = "Pareado. Enviando status a cada minuto."
            startHeartbeat()
            root.addView(title)
            root.addView(status)
            setContentView(root)
            return
        }

        val input = EditText(this).apply {
            hint = "Código de pareamento"
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
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
                        val token = JSONObject(result.body).optString("device_token")
                        if (token.isNotEmpty()) {
                            Prefs.setToken(this, token)
                            status.text = "Pareado! Enviando status a cada minuto."
                            startHeartbeat()
                        } else {
                            status.text = "Resposta inválida do servidor."
                        }
                    } else {
                        status.text = "Falha (${result.code}): ${result.body}"
                    }
                }
            }.start()
        }

        root.addView(title)
        root.addView(input)
        root.addView(button)
        root.addView(status)
        setContentView(root)
    }

    private fun androidId(): String =
        Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"

    private fun startHeartbeat() {
        val i = Intent(this, HeartbeatService::class.java)
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i) else startService(i)
    }
}
