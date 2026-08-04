package com.linka.agent

import android.content.Context

/**
 * Armazenamento local do aparelho.
 *
 * Fica no armazenamento PROTEGIDO POR APARELHO, e não no do usuário, e isso é o
 * que permite a vitrine existir antes de alguém destravar o telefone.
 *
 * O armazenamento normal do app só é montado depois que o usuário destrava. Como
 * o LINKA é a tela inicial obrigatória do aparelho, ele precisa conseguir subir
 * ANTES disso — senão o Android procura uma tela inicial, não acha nenhuma, e o
 * aparelho nunca termina de ligar. Foi exatamente o que aconteceu: dois
 * aparelhos ficaram presos na animação de boot até isto ser descoberto.
 *
 * A mudança de lugar é feita uma vez, sem perder o que já estava gravado: o
 * aparelho que já estava na frota continua na frota, com o mesmo token.
 */
object Prefs {
    private const val NAME = "linka"

    @Volatile
    private var deContext: Context? = null

    /** Contexto de armazenamento que existe mesmo com o aparelho travado. */
    private fun de(ctx: Context): Context {
        deContext?.let { return it }
        val protegido = if (ctx.isDeviceProtectedStorage) ctx
        else ctx.createDeviceProtectedStorageContext()
        // Devolve false quando já foi movido: não custa nada chamar de novo.
        try {
            protegido.moveSharedPreferencesFrom(ctx.applicationContext, NAME)
        } catch (_: Exception) {
        }
        deContext = protegido
        return protegido
    }
    private const val KEY_TOKEN = "device_token"

    fun token(ctx: Context): String? =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_TOKEN, null)

    fun setToken(ctx: Context, value: String) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_TOKEN, value).apply()

    private const val KEY_PLAYING = "playing_url"

    /** URL do conteúdo que o app está exibindo agora (para reportar no heartbeat). */
    fun playingUrl(ctx: Context): String? =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_PLAYING, null)

    fun setPlayingUrl(ctx: Context, value: String?) {
        val editor = de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).edit()
        if (value == null) editor.remove(KEY_PLAYING) else editor.putString(KEY_PLAYING, value)
        editor.apply()
    }

    // ── Faxina diária ────────────────────────────────────────────────────────
    private const val KEY_CLEANUP_ON = "cleanup_enabled"
    private const val KEY_CLEANUP_TIME = "cleanup_time"
    private const val KEY_CLEANUP_DAY = "last_cleanup_day"

    fun cleanupEnabled(ctx: Context): Boolean =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getBoolean(KEY_CLEANUP_ON, true)

    fun setCleanupEnabled(ctx: Context, value: Boolean) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putBoolean(KEY_CLEANUP_ON, value).apply()

    /** "23:00" — horário local do aparelho. */
    fun cleanupTime(ctx: Context): String =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .getString(KEY_CLEANUP_TIME, "23:00") ?: "23:00"

    fun setCleanupTime(ctx: Context, value: String) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_CLEANUP_TIME, value).apply()

    private const val KEY_INVENTARIO = "last_inventory_at"

    /** Quando o inventário de apps foi enviado pela última vez. */
    fun lastInventoryAt(ctx: Context): Long =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getLong(KEY_INVENTARIO, 0L)

    fun setLastInventoryAt(ctx: Context, value: Long) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putLong(KEY_INVENTARIO, value).apply()

    private const val KEY_ABRE = "store_opens_at"
    private const val KEY_FECHA = "store_closes_at"

    /**
     * Expediente da loja, hora local ("09:00"/"22:00"), vindo do painel.
     *
     * O aparelho precisa disso na mão: com a loja aberta ele acende a tela
     * sozinha se apagar, e com a loja fechada deixa quieto. Guardado localmente
     * porque a decisão é tomada a cada 5 segundos, inclusive sem rede.
     */
    fun storeOpensAt(ctx: Context): String =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_ABRE, "09:00")!!

    fun storeClosesAt(ctx: Context): String =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_FECHA, "22:00")!!

    fun setStoreHours(ctx: Context, abre: String, fecha: String) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_ABRE, abre).putString(KEY_FECHA, fecha).apply()

    /** Dia da última faxina ("2026-07-27"): impede repetir no mesmo dia. */
    fun lastCleanupDay(ctx: Context): String? =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_CLEANUP_DAY, null)

    fun setLastCleanupDay(ctx: Context, value: String) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_CLEANUP_DAY, value).apply()

    private const val KEY_CLEANUP_REPORT = "pending_cleanup_report"

    /** Relato da faxina esperando o próximo heartbeat levar ao painel. */
    fun pendingCleanupReport(ctx: Context): String? =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_CLEANUP_REPORT, null)

    fun setPendingCleanupReport(ctx: Context, value: String?) {
        val e = de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).edit()
        if (value == null) e.remove(KEY_CLEANUP_REPORT) else e.putString(KEY_CLEANUP_REPORT, value)
        e.apply()
    }

    // ── Atualização automática: tentativas e desistência ─────────────────────
    private const val KEY_UPD_VERSION = "update_try_version"
    private const val KEY_UPD_COUNT = "update_try_count"
    private const val KEY_UPD_ERROR = "update_error"

    /** Tentativas já feitas para ESTA versão (zera quando a versão alvo muda). */
    fun updateAttempts(ctx: Context, version: String): Int {
        val p = de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
        return if (p.getString(KEY_UPD_VERSION, null) == version) {
            p.getInt(KEY_UPD_COUNT, 0)
        } else 0
    }

    fun setUpdateAttempt(ctx: Context, version: String, count: Int) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).edit()
            .putString(KEY_UPD_VERSION, version).putInt(KEY_UPD_COUNT, count).apply()

    fun updateError(ctx: Context): String? =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_UPD_ERROR, null)

    fun setUpdateError(ctx: Context, value: String) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_UPD_ERROR, value).apply()

    /** Atualizou com sucesso: some o histórico de falha e o aviso do painel. */
    fun clearUpdateFailure(ctx: Context) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).edit()
            .remove(KEY_UPD_VERSION).remove(KEY_UPD_COUNT).remove(KEY_UPD_ERROR).apply()

    private const val KEY_LAST_SCAN = "last_event_scan"

    /** Até onde já lemos o uso do aparelho — evita recontar e evita pular. */
    fun lastEventScan(ctx: Context): Long =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getLong(KEY_LAST_SCAN, 0L)

    fun setLastEventScan(ctx: Context, value: Long) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putLong(KEY_LAST_SCAN, value).apply()

    private const val KEY_SESSAO_PKG = "sessao_aberta_pkg"
    private const val KEY_SESSAO_DESDE = "sessao_aberta_desde"

    /**
     * O trecho que ainda esta correndo: qual app esta na frente e desde quando.
     *
     * POR QUE ISTO PRECISA SER LEMBRADO. O aparelho descobre quem esta na frente
     * lendo os avisos do Android ("o app X entrou as 14h"). Enquanto ninguem
     * encosta no aparelho, nao chega aviso nenhum — entao, sem memoria, cada
     * leitura teria de voltar ate o comeco do trecho para reencontrar aquele
     * aviso. Era o que acontecia, e cobrava caro duas vezes: reler dias inteiros
     * de historico a cada minuto, e — pior — o historico do Android tem prazo de
     * validade. Trecho mais longo que o prazo perdia o proprio comeco, e o tempo
     * de vitrine sumia de vez em vez de so atrasar.
     *
     * Com o trecho lembrado aqui, a leitura anda sempre para a frente.
     */
    fun sessaoAbertaPkg(ctx: Context): String? =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_SESSAO_PKG, null)

    fun sessaoAbertaDesde(ctx: Context): Long =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getLong(KEY_SESSAO_DESDE, 0L)

    fun setSessaoAberta(ctx: Context, pacote: String?, desde: Long) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).edit()
            .putString(KEY_SESSAO_PKG, pacote)
            .putLong(KEY_SESSAO_DESDE, desde)
            .apply()

    private const val KEY_BLOCK_SETTINGS = "block_settings"

    /** Bloquear Ajustes e Play Store (decidido no painel, por aparelho). */
    fun blockSettings(ctx: Context): Boolean =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getBoolean(KEY_BLOCK_SETTINGS, false)

    fun setBlockSettings(ctx: Context, value: Boolean) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putBoolean(KEY_BLOCK_SETTINGS, value).apply()

    private const val KEY_RESET_TOKEN = "reset_token"

    /**
     * Token que permite apagar a senha da tela remotamente. Fica aqui porque
     * precisa sobreviver a reinício — e sem ele um aparelho com PIN de
     * brincadeira só volta com visita à loja.
     */
    fun resetToken(ctx: Context): String? =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_RESET_TOKEN, null)

    fun setResetToken(ctx: Context, value: String) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_RESET_TOKEN, value).apply()

    private const val KEY_PUBLISHED = "published_version"

    /**
     * Versão publicada no painel. Quem decide se está atualizado é o aparelho, que
     * conhece as duas pontas — o servidor comparando com o que tinha em cache dava
     * "atualizado" logo depois de uma instalação, o que é mentira por alguns segundos.
     */
    fun publishedVersion(ctx: Context): String? =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_PUBLISHED, null)

    fun setPublishedVersion(ctx: Context, value: String) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_PUBLISHED, value).apply()

    private const val KEY_VOLUME = "volume_percent"

    /** Volume do vídeo (0 = mudo, padrão). Definido no painel, por aparelho. */
    fun volumePercent(ctx: Context): Int =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getInt(KEY_VOLUME, 0)

    fun setVolumePercent(ctx: Context, value: Int) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putInt(KEY_VOLUME, value.coerceIn(0, 100)).apply()

    private const val KEY_LEFT_AT = "left_at"
    private const val KEY_IDLE_RETURN = "idle_return_seconds"

    /**
     * Momento em que o cliente saiu do app (0 = está na vitrine).
     * Guardado aqui e não em memória porque quem vigia é o serviço, que sobrevive
     * à tela sendo trocada.
     */
    fun leftAt(ctx: Context): Long =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getLong(KEY_LEFT_AT, 0L)

    fun setLeftAt(ctx: Context, value: Long) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putLong(KEY_LEFT_AT, value).apply()

    /** Segundos fora do app antes de voltar sozinho (definido no painel). */
    fun idleReturnSeconds(ctx: Context): Int =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getInt(KEY_IDLE_RETURN, 30)

    fun setIdleReturnSeconds(ctx: Context, value: Int) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putInt(KEY_IDLE_RETURN, value).apply()

    private const val KEY_BATIDA = "heartbeat_seconds"

    /**
     * De quantos em quantos segundos o aparelho diz "estou aqui".
     *
     * VEM DO PAINEL, e o padrao e 60 — o mesmo ritmo de sempre, para um aparelho
     * que ainda nao conversou com o servidor nao inventar cadencia propria.
     *
     * A folga de 30 a 900 nao e enfeite: e uma resposta corrompida, ou um campo
     * que um dia venha zerado, transformando a frota inteira num aparelho que
     * fala sem parar (conta estourada) ou que some por horas (frota cega). O
     * limite mora nos dois lados de proposito.
     */
    fun heartbeatSeconds(ctx: Context): Int =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getInt(KEY_BATIDA, 60)

    fun setHeartbeatSeconds(ctx: Context, value: Int) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putInt(KEY_BATIDA, value.coerceIn(30, 900)).apply()

    private const val KEY_SYNCED = "synced"
    private const val KEY_REVISAO = "revisao_aplicada"
    private const val KEY_PUSH = "push_token"
    private const val KEY_QR = "codigo_do_qr"
    private const val KEY_JA_FALOU = "ja_falou_com_servidor"
    private const val KEY_REDE_LIBERADA = "rede_liberada_para_manutencao"

    /**
     * O aparelho ja conversou com o servidor pelo menos uma vez?
     *
     * Existe por causa de um aparelho que ficou trancado FORA da rede: as travas
     * de wi-fi entram no instante em que o app vira dono, e num aparelho ainda sem
     * rede elas impedem de configurar wi-fi para sempre. So se recupera com cabo —
     * e na loja nao vai ter cabo nem notebook.
     *
     * Nao se tranca a porta antes de entrar.
     */
    fun jaFalouComServidor(ctx: Context): Boolean =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getBoolean(KEY_JA_FALOU, false)

    fun marcarQueFalouComServidor(ctx: Context) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putBoolean(KEY_JA_FALOU, true).apply()

    /**
     * A rede esta destravada de proposito, para o tecnico trocar de wi-fi.
     *
     * Enquanto isto for verdade as travas de rede NAO voltam — nem pela batida,
     * nem pelo fim da manutencao. Elas so voltam quando o aparelho provar que
     * alcanca o servidor pela rede nova (ver Telemetry).
     *
     * Sem esta marca a manutencao seria inutil: bastava a proxima batida rodar
     * applyPolicies para o wi-fi trancar de novo na cara do tecnico. E pior — se
     * a rede nova estiver errada, trancar sem prova devolve exatamente o defeito
     * que custou uma restauracao de fabrica (ver Kiosk.RESTRICTIONS_DE_REDE).
     */
    fun redeLiberada(ctx: Context): Boolean =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_REDE_LIBERADA, false)

    fun setRedeLiberada(ctx: Context, value: Boolean) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putBoolean(KEY_REDE_LIBERADA, value).apply()

    /**
     * Quantas passadas da NUVEM ja foram gastas com um video.
     *
     * Existe porque "tocar da nuvem so uma vez" e uma intencao, e intencao nao
     * sobrevive a reinicio: tela apaga e acende, app atualiza, quiosque re-entra —
     * cada volta e uma "primeira vez" nova. Dez reinicios numa hora viravam dez
     * downloads do arquivo inteiro.
     *
     * Gravado em disco de proposito. Contador na memoria zeraria junto com o
     * processo, que e exatamente quando ele mais precisa lembrar.
     */
    fun passadasDaNuvem(ctx: Context, url: String): Int =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .getInt("nuvem_" + url.hashCode(), 0)

    fun contarPassadaDaNuvem(ctx: Context, url: String): Int {
        val p = de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
        val n = p.getInt("nuvem_" + url.hashCode(), 0) + 1
        p.edit().putInt("nuvem_" + url.hashCode(), n).apply()
        return n
    }

    /** O arquivo desceu: o orcamento deste video nao serve mais para nada. */
    fun limparPassadasDaNuvem(ctx: Context, url: String) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().remove("nuvem_" + url.hashCode()).apply()

    /**
     * Codigo da loja que veio dentro do QR de instalacao.
     *
     * Fica gravado ate o pareamento dar certo: o provisionamento termina antes de
     * haver rede utilizavel, e perder o codigo por causa disso obrigaria alguem a
     * digitar — que e exatamente o que o QR existe para evitar.
     */
    fun codigoDoQr(ctx: Context): String? =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_QR, null)

    fun setCodigoDoQr(ctx: Context, valor: String?) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_QR, valor).apply()

    /** Endereco deste aparelho no FCM. Nulo = so o heartbeat acorda ele. */
    fun pushToken(ctx: Context): String? =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_PUSH, null)

    fun setPushToken(ctx: Context, valor: String?) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_PUSH, valor).apply()
    private const val KEY_NOVIDADE = "novidade_pendente"

    /**
     * Impressao digital do conteudo que este aparelho JA APLICOU.
     *
     * Vai em toda batida; o servidor recalcula a de agora e responde so
     * "mudou: sim/nao". So e gravada DEPOIS de aplicar — resposta recebida e nao
     * aplicada nao pode fazer o aparelho se declarar em dia.
     */
    fun revisao(ctx: Context): String? =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_REVISAO, null)

    fun setRevisao(ctx: Context, valor: String?) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_REVISAO, valor).apply()

    /** O servidor avisou que mudou; a vitrine busca na proxima volta do relogio. */
    fun novidadePendente(ctx: Context): Boolean =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getBoolean(KEY_NOVIDADE, false)

    fun setNovidadePendente(ctx: Context, valor: Boolean) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putBoolean(KEY_NOVIDADE, valor).apply()

    /** Toda a campanha já está baixada no aparelho (alimenta o KPI "Sincronizados"). */
    fun synced(ctx: Context): Boolean =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getBoolean(KEY_SYNCED, false)

    fun setSynced(ctx: Context, value: Boolean) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putBoolean(KEY_SYNCED, value).apply()

    private const val KEY_PLAYLIST = "playlist_aplicada"
    private const val KEY_ROTACAO = "rotacao_segundos"

    /**
     * A CAMPANHA INTEIRA, GRAVADA — e por que ela não podia viver só na memória.
     *
     * O aparelho faz o rodízio sozinho a partir desta lista. Só que ela nascia
     * vazia a cada subida do processo (reinstalação, o Android recolhendo memória,
     * uma queda), e quem a preenchia era UMA chamada de rede na subida. Falhando
     * essa única chamada — o wi-fi da loja piscando no minuto em que o app se
     * atualiza sozinho —, o aparelho ficava preso no último vídeo até a rede de
     * segurança de 30 minutos.
     *
     * E ninguém veria: a batida continua, o vídeo continua tocando, o painel
     * continua verde. O sintoma é só o aparelho ao lado exibindo outra coisa —
     * que este arquivo já chama, com razão, do defeito mais visível que existe
     * numa bancada de loja.
     *
     * Gravada, a lista sobrevive à subida e o rodízio recomeça sem rede nenhuma,
     * pelo mesmo motivo que o último vídeo já era retomado do cache: reiniciar
     * sem internet não pode custar a vitrine.
     */
    fun playlistSalva(ctx: Context): String? =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_PLAYLIST, null)

    fun rotacaoSalva(ctx: Context): Int =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getInt(KEY_ROTACAO, 0)

    fun setPlaylistSalva(ctx: Context, json: String?, rotacao: Int) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_PLAYLIST, json).putInt(KEY_ROTACAO, rotacao).apply()

    private const val KEY_MODE = "mode"

    /** Estado operacional real: not_running | main_menu | show (o painel não deve adivinhar). */
    fun mode(ctx: Context): String =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_MODE, "not_running")
            ?: "not_running"

    fun setMode(ctx: Context, value: String) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_MODE, value).apply()

    // ── Trecho de exibição em aberto ─────────────────────────────────────────
    // Qual vídeo começou a tocar e quando. Mora aqui, e não em memória, porque o
    // trecho precisa sobreviver ao app ser reiniciado: sem isso, todo reinício
    // engoliria silenciosamente o período de exibição anterior.
    private const val KEY_MEDIA_URL = "media_open_url"
    private const val KEY_MEDIA_SINCE = "media_open_since"
    private const val KEY_MEDIA_ALIVE = "media_open_alive"

    fun mediaUrl(ctx: Context): String? =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_MEDIA_URL, null)

    fun mediaSince(ctx: Context): Long =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getLong(KEY_MEDIA_SINCE, 0L)

    /**
     * Último instante em que o app comprovadamente estava rodando. É o que impede
     * de contar como exibição o tempo em que o aparelho esteve desligado: o
     * trecho fecha no último sinal de vida, não no relógio de agora.
     */
    fun mediaAlive(ctx: Context): Long =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getLong(KEY_MEDIA_ALIVE, 0L)

    fun setMediaOpen(ctx: Context, url: String, since: Long) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).edit()
            .putString(KEY_MEDIA_URL, url).putLong(KEY_MEDIA_SINCE, since).apply()

    fun setMediaAlive(ctx: Context, at: Long) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putLong(KEY_MEDIA_ALIVE, at).apply()

    fun clearMediaOpen(ctx: Context) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).edit()
            .remove(KEY_MEDIA_URL).remove(KEY_MEDIA_SINCE).apply()

    private const val KEY_FIT = "playing_fit"

    /** Enquadramento aplicado ao conteúdo em exibição (zoom | fit). */
    fun playingFit(ctx: Context): String? =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_FIT, null)

    fun setPlayingFit(ctx: Context, value: String?) {
        val editor = de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).edit()
        if (value == null) editor.remove(KEY_FIT) else editor.putString(KEY_FIT, value)
        editor.apply()
    }

    // ── Saída de manutenção ─────────────────────────────────────────────────
    //
    // Guarda o HASH do PIN, nunca o PIN. Quem envia já envia com hash
    // (agent-content), então o número da rede não fica escrito em aparelho
    // nenhum — e abrir a memória de um aparelho não entrega a chave dos outros.

    private const val KEY_PIN_HASH = "maintenance_pin_sha256"
    private const val KEY_PIN_ERROS = "maintenance_pin_erros"
    private const val KEY_PIN_BLOQUEIO = "maintenance_pin_bloqueio_ate"
    private const val KEY_SAIDA_PENDENTE = "maintenance_exit_pendente"

    fun maintenancePinHash(ctx: Context): String? =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_PIN_HASH, null)

    fun setMaintenancePinHash(ctx: Context, value: String?) {
        val editor = de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).edit()
        if (value.isNullOrEmpty()) editor.remove(KEY_PIN_HASH)
        else editor.putString(KEY_PIN_HASH, value)
        editor.apply()
    }

    fun pinErros(ctx: Context): Int =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getInt(KEY_PIN_ERROS, 0)

    /**
     * Até quando a tela de PIN fica recusando tentativa.
     *
     * Sobrevive a reiniciar o aparelho de propósito: se o bloqueio morresse ao
     * desligar, o limite de tentativas não valeria nada — bastaria reiniciar
     * entre cada trinca de palpites.
     */
    fun pinBloqueadoAte(ctx: Context): Long =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getLong(KEY_PIN_BLOQUEIO, 0L)

    fun registrarErroDePin(ctx: Context, limite: Int, bloqueioMs: Long) {
        val p = de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
        val erros = p.getInt(KEY_PIN_ERROS, 0) + 1
        val editor = p.edit().putInt(KEY_PIN_ERROS, erros)
        if (erros >= limite) {
            editor.putLong(KEY_PIN_BLOQUEIO, System.currentTimeMillis() + bloqueioMs)
                .putInt(KEY_PIN_ERROS, 0)
        }
        editor.apply()
    }

    fun limparErrosDePin(ctx: Context) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).edit()
            .remove(KEY_PIN_ERROS).remove(KEY_PIN_BLOQUEIO).apply()

    /**
     * Saída que aconteceu e ainda não foi contada ao painel.
     *
     * Fica gravada porque a saída acontece na loja, onde a rede pode estar
     * ruim: sem isso, destravar sem internet viraria destravar sem registro —
     * exatamente o caso em que a trilha mais importa.
     */
    fun saidaPendente(ctx: Context): String? =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_SAIDA_PENDENTE, null)

    fun setSaidaPendente(ctx: Context, value: String?) {
        val editor = de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).edit()
        if (value == null) editor.remove(KEY_SAIDA_PENDENTE)
        else editor.putString(KEY_SAIDA_PENDENTE, value)
        editor.apply()
    }

    private const val KEY_MANUTENCAO_ATE = "manutencao_ate"

    /**
     * Até quando o aparelho está liberado para manutenção. 0 = vitrine normal.
     *
     * Um valor só resolve duas coisas que precisam concordar, e é por isso que
     * não são dois:
     *
     *   1. enquanto durar, o serviço PARA de trazer a vitrine de volta. Sem
     *      isso o retorno automático puxaria o técnico de dentro dos Ajustes a
     *      cada 30 segundos e a manutenção seria impossível;
     *   2. quando vencer, o serviço tranca de novo, mesmo que o técnico tenha
     *      ido embora com o aparelho em outra tela.
     *
     * Se fossem dois valores, um poderia expirar sem o outro — e a falha
     * silenciosa seria a pior das duas: vitrine destravada na loja, achando que
     * está protegida.
     *
     * Gravado (e não só em memória) porque quem lê é o serviço e quem escreve é
     * a tela: são processos que o Android pode matar em ordens diferentes.
     */
    fun manutencaoAte(ctx: Context): Long =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getLong(KEY_MANUTENCAO_ATE, 0L)

    fun setManutencaoAte(ctx: Context, value: Long) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
            .edit().putLong(KEY_MANUTENCAO_ATE, value).apply()

    fun emManutencao(ctx: Context): Boolean =
        System.currentTimeMillis() < manutencaoAte(ctx)

    // ── Token recusado pelo servidor ─────────────────────────────────────────
    //
    // O servidor responde 401 quando o token nao vale mais. Isso acontece de
    // verdade: o provisionamento troca o token a cada entrada (protecao contra
    // quem tem o codigo de inscricao), entao um aparelho reprovisionado em outro
    // lugar deixa o antigo com um token morto.
    //
    // Antes o agente simplesmente parava: 401 caia no mesmo `return` de "sem
    // rede" e o aparelho ficava mudo PARA SEMPRE, com a vitrine tocando o ultimo
    // video e o painel dizendo "fora do ar" sem motivo visivel. Nao havia caminho
    // de volta sem cabo.

    private const val KEY_RECUSAS = "token_recusado_vezes"

    fun recusasDeToken(ctx: Context): Int =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).getInt(KEY_RECUSAS, 0)

    fun contarRecusaDeToken(ctx: Context): Int {
        val p = de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE)
        val n = p.getInt(KEY_RECUSAS, 0) + 1
        p.edit().putInt(KEY_RECUSAS, n).apply()
        return n
    }

    fun limparRecusasDeToken(ctx: Context) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).edit()
            .remove(KEY_RECUSAS).apply()

    /**
     * Esquece o token e volta a ser um aparelho sem frota.
     *
     * Nao apaga mais nada de proposito: o aparelho continua dono de si, continua
     * com o video em cache e continua sabendo o horario da loja. So perde a
     * credencial — que e justamente o que esta errado.
     */
    fun esquecerToken(ctx: Context) =
        de(ctx).getSharedPreferences(NAME, Context.MODE_PRIVATE).edit()
            .remove(KEY_TOKEN).remove(KEY_RECUSAS).apply()
}
