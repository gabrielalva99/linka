package com.linka.agent

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject

/**
 * Fila durável de eventos no próprio aparelho.
 *
 * A rede da loja cai — é o normal, não a exceção. Se o evento só existisse na
 * memória, cada queda apagaria o comportamento do cliente daquele período, e o
 * BI receberia um número menor sem ninguém perceber (o pior tipo de erro: o
 * silencioso). Gravar primeiro no aparelho e só apagar depois que o servidor
 * confirma é o que torna o dado confiável.
 *
 * SQLite do próprio Android: sem dependência externa no agente.
 */
class EventQueue(ctx: Context) : SQLiteOpenHelper(ctx, "linka_events.db", null, 2) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            create table events (
              id integer primary key autoincrement,
              event_id text not null unique,
              kind text not null,
              package text,
              started_at text not null,
              ended_at text,
              duration_seconds integer,
              media_url text
            )
            """.trimIndent(),
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) {
        // Coluna nova, tabela preservada: o aparelho que está com a fila cheia
        // porque a loja está sem internet não pode perder o que já mediu só
        // porque o app foi atualizado.
        if (old < 2) db.execSQL("alter table events add column media_url text")
    }

    fun add(
        eventId: String,
        kind: String,
        pkg: String?,
        startedAt: String,
        endedAt: String?,
        durationSeconds: Long?,
        mediaUrl: String? = null,
    ) {
        val values = ContentValues().apply {
            put("event_id", eventId)
            put("kind", kind)
            put("package", pkg)
            put("started_at", startedAt)
            put("ended_at", endedAt)
            put("duration_seconds", durationSeconds)
            put("media_url", mediaUrl)
        }
        // CONFLICT_IGNORE: o mesmo evento visto duas vezes não duplica a fila.
        writableDatabase.insertWithOnConflict(
            "events", null, values, SQLiteDatabase.CONFLICT_IGNORE,
        )
    }

    fun pending(limit: Int = 200): Pair<List<Long>, JSONArray> {
        val ids = mutableListOf<Long>()
        val array = JSONArray()
        readableDatabase.query(
            "events", null, null, null, null, null, "id asc", limit.toString(),
        ).use { c ->
            while (c.moveToNext()) {
                ids.add(c.getLong(c.getColumnIndexOrThrow("id")))
                array.put(
                    JSONObject()
                        .put("event_id", c.getString(c.getColumnIndexOrThrow("event_id")))
                        .put("kind", c.getString(c.getColumnIndexOrThrow("kind")))
                        .put("package", c.getString(c.getColumnIndexOrThrow("package")) ?: JSONObject.NULL)
                        .put("started_at", c.getString(c.getColumnIndexOrThrow("started_at")))
                        .put("ended_at", c.getString(c.getColumnIndexOrThrow("ended_at")) ?: JSONObject.NULL)
                        .put("duration_seconds", c.getLong(c.getColumnIndexOrThrow("duration_seconds")))
                        .put("media_url", c.getString(c.getColumnIndexOrThrow("media_url")) ?: JSONObject.NULL),
                )
            }
        }
        return ids to array
    }

    /** Só apaga o que o servidor confirmou ter gravado. */
    fun remove(ids: List<Long>) {
        if (ids.isEmpty()) return
        writableDatabase.execSQL(
            "delete from events where id in (${ids.joinToString(",")})",
        )
    }

    fun size(): Int =
        readableDatabase.rawQuery("select count(*) from events", null).use {
            if (it.moveToFirst()) it.getInt(0) else 0
        }
}
