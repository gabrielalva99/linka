package com.linka.agent

import android.content.Context

/** Armazenamento local simples do token do dispositivo. */
object Prefs {
    private const val NAME = "linka"
    private const val KEY_TOKEN = "device_token"

    fun token(ctx: Context): String? =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_TOKEN, null)

    fun setToken(ctx: Context, value: String) =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_TOKEN, value).apply()
}
