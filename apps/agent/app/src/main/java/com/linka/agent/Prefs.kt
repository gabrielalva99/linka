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

    // ── Faxina diária ────────────────────────────────────────────────────────
    private const val KEY_CLEANUP_ON = "cleanup_enabled"
    private const val KEY_CLEANUP_TIME = "cleanup_time"
    private const val KEY_CLEANUP_DAY = "last_cleanup_day"

    fun cleanupEnabled(ctx: Context): Boolean =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).getBoolean(KEY_CLEANUP_ON, true)

    fun setCleanupEnabled(ctx: Context, value: Boolean) =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putBoolean(KEY_CLEANUP_ON, value).apply()

    /** "23:00" — horário local do aparelho. */
    fun cleanupTime(ctx: Context): String =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .getString(KEY_CLEANUP_TIME, "23:00") ?: "23:00"

    fun setCleanupTime(ctx: Context, value: String) =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_CLEANUP_TIME, value).apply()

    /** Dia da última faxina ("2026-07-27"): impede repetir no mesmo dia. */
    fun lastCleanupDay(ctx: Context): String? =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_CLEANUP_DAY, null)

    fun setLastCleanupDay(ctx: Context, value: String) =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_CLEANUP_DAY, value).apply()

    private const val KEY_CLEANUP_REPORT = "pending_cleanup_report"

    /** Relato da faxina esperando o próximo heartbeat levar ao painel. */
    fun pendingCleanupReport(ctx: Context): String? =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_CLEANUP_REPORT, null)

    fun setPendingCleanupReport(ctx: Context, value: String?) {
        val e = ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).edit()
        if (value == null) e.remove(KEY_CLEANUP_REPORT) else e.putString(KEY_CLEANUP_REPORT, value)
        e.apply()
    }

    // ── Atualização automática: tentativas e desistência ─────────────────────
    private const val KEY_UPD_VERSION = "update_try_version"
    private const val KEY_UPD_COUNT = "update_try_count"
    private const val KEY_UPD_ERROR = "update_error"

    /** Tentativas já feitas para ESTA versão (zera quando a versão alvo muda). */
    fun updateAttempts(ctx: Context, version: String): Int {
        val p = ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)
        return if (p.getString(KEY_UPD_VERSION, null) == version) {
            p.getInt(KEY_UPD_COUNT, 0)
        } else 0
    }

    fun setUpdateAttempt(ctx: Context, version: String, count: Int) =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).edit()
            .putString(KEY_UPD_VERSION, version).putInt(KEY_UPD_COUNT, count).apply()

    fun updateError(ctx: Context): String? =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_UPD_ERROR, null)

    fun setUpdateError(ctx: Context, value: String) =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_UPD_ERROR, value).apply()

    /** Atualizou com sucesso: some o histórico de falha e o aviso do painel. */
    fun clearUpdateFailure(ctx: Context) =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).edit()
            .remove(KEY_UPD_VERSION).remove(KEY_UPD_COUNT).remove(KEY_UPD_ERROR).apply()

    private const val KEY_RESET_TOKEN = "reset_token"

    /**
     * Token que permite apagar a senha da tela remotamente. Fica aqui porque
     * precisa sobreviver a reinício — e sem ele um aparelho com PIN de
     * brincadeira só volta com visita à loja.
     */
    fun resetToken(ctx: Context): String? =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_RESET_TOKEN, null)

    fun setResetToken(ctx: Context, value: String) =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_RESET_TOKEN, value).apply()

    private const val KEY_PUBLISHED = "published_version"

    /**
     * Versão publicada no painel. Quem decide se está atualizado é o aparelho, que
     * conhece as duas pontas — o servidor comparando com o que tinha em cache dava
     * "atualizado" logo depois de uma instalação, o que é mentira por alguns segundos.
     */
    fun publishedVersion(ctx: Context): String? =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_PUBLISHED, null)

    fun setPublishedVersion(ctx: Context, value: String) =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_PUBLISHED, value).apply()

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
