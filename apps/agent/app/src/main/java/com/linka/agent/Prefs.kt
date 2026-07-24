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

    private const val KEY_PLAYING = "playing_url"

    /** URL do conteúdo que o app está exibindo agora (para reportar no heartbeat). */
    fun playingUrl(ctx: Context): String? =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_PLAYING, null)

    fun setPlayingUrl(ctx: Context, value: String?) {
        val editor = ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).edit()
        if (value == null) editor.remove(KEY_PLAYING) else editor.putString(KEY_PLAYING, value)
        editor.apply()
    }
}
