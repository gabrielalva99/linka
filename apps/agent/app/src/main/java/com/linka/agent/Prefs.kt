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

    private const val KEY_VOLUME = "volume_percent"

    /** Volume do vídeo (0 = mudo, padrão). Definido no painel, por aparelho. */
    fun volumePercent(ctx: Context): Int =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).getInt(KEY_VOLUME, 0)

    fun setVolumePercent(ctx: Context, value: Int) =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putInt(KEY_VOLUME, value.coerceIn(0, 100)).apply()

    private const val KEY_LEFT_AT = "left_at"
    private const val KEY_IDLE_RETURN = "idle_return_seconds"

    /**
     * Momento em que o cliente saiu do app (0 = está na vitrine).
     * Guardado aqui e não em memória porque quem vigia é o serviço, que sobrevive
     * à tela sendo trocada.
     */
    fun leftAt(ctx: Context): Long =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).getLong(KEY_LEFT_AT, 0L)

    fun setLeftAt(ctx: Context, value: Long) =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putLong(KEY_LEFT_AT, value).apply()

    /** Segundos fora do app antes de voltar sozinho (definido no painel). */
    fun idleReturnSeconds(ctx: Context): Int =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).getInt(KEY_IDLE_RETURN, 30)

    fun setIdleReturnSeconds(ctx: Context, value: Int) =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putInt(KEY_IDLE_RETURN, value).apply()

    private const val KEY_SYNCED = "synced"

    /** Toda a campanha já está baixada no aparelho (alimenta o KPI "Sincronizados"). */
    fun synced(ctx: Context): Boolean =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).getBoolean(KEY_SYNCED, false)

    fun setSynced(ctx: Context, value: Boolean) =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putBoolean(KEY_SYNCED, value).apply()

    private const val KEY_MODE = "mode"

    /** Estado operacional real: not_running | main_menu | show (o painel não deve adivinhar). */
    fun mode(ctx: Context): String =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_MODE, "not_running")
            ?: "not_running"

    fun setMode(ctx: Context, value: String) =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_MODE, value).apply()

    private const val KEY_FIT = "playing_fit"

    /** Enquadramento aplicado ao conteúdo em exibição (zoom | fit). */
    fun playingFit(ctx: Context): String? =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_FIT, null)

    fun setPlayingFit(ctx: Context, value: String?) {
        val editor = ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).edit()
        if (value == null) editor.remove(KEY_FIT) else editor.putString(KEY_FIT, value)
        editor.apply()
    }
}
