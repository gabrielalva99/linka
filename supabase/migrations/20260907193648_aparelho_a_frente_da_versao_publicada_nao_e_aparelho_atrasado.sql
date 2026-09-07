-- `versao_atrasada` acusava quem estava ADIANTE.
--
-- ── O QUE ACONTECEU (07/09) ─────────────────────────────────────────────────
-- O box de teste ficou na 0.116.0 enquanto a publicada era a 0.115.0, e o painel
-- abriu "continua na versao 0.116.0, e a publicada e a 0.115.0". O alerta subiu e
-- chegou ao bot. Aparelho a frente nao esta atrasado: nao ha nada a corrigir, e
-- nao existe acao possivel do outro lado do aviso.
--
-- ── E A MESMA ARMADILHA QUE O AGENTE JA TINHA RESOLVIDO ─────────────────────
-- `SelfUpdate.isNewer` existe exatamente por isso, e o comentario de la diz:
-- "Comparar por 'diferente' fazia um aparelho que ja estava adiante (build de
-- teste em campo) tentar rebaixar para a versao publicada". O agente aprendeu a
-- licao; esta visao ficou com a comparacao antiga, `agent_version <> versao_atual`.
-- Classe varrida pela metade.
--
-- Isso nao e caso de teste isolado: acontece TODA VEZ que uma build de teste vai
-- para um aparelho em campo, que e rotina aqui.
--
-- ── COMO COMPARAR VERSAO EM SQL ────────────────────────────────────────────
-- Texto nao serve: '0.9.0' > '0.115.0' em ordem alfabetica. Array de inteiros
-- serve, porque o Postgres compara elemento a elemento: [0,115,0] < [0,116,0].
-- O regex protege o cast de versao com sufixo (rc, beta) e de nulo.
create or replace function public.versao_e_mais_velha(p_do_aparelho text, p_publicada text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select case
    when p_do_aparelho is null or p_publicada is null then false
    when p_do_aparelho !~ '^[0-9]+(\.[0-9]+)*$' then false
    when p_publicada   !~ '^[0-9]+(\.[0-9]+)*$' then false
    else string_to_array(p_do_aparelho, '.')::int[] < string_to_array(p_publicada, '.')::int[]
  end;
$$;

comment on function public.versao_e_mais_velha(text, text) is
  'Verdadeiro so quando a versao do aparelho e ANTERIOR a publicada. Aparelho adiante (build de teste) devolve falso, e nao vira alerta. Versao com sufixo nao numerico devolve falso, para nao acusar por engano.';

-- Recria a visao trocando `<>` por essa funcao no ponto de `versao_atrasada`.
-- O resto e identico a migration de 07/09 que consertou a TV.
create or replace view public.v_device_issues as
 WITH base AS (
         SELECT d.id AS device_id,
            d.tenant_id,
            d.code,
            d.name,
            d.exclude_from_reports,
            d.model_id,
            d.store_id,
            d.device_type,
            d.pode_atualizar_sozinho,
            s.name AS loja,
            COALESCE(s.timezone, 'America/Sao_Paulo'::text) AS tz,
            COALESCE(s.opens_at, '09:00:00'::time without time zone) AS abre,
            COALESCE(s.closes_at, '22:00:00'::time without time zone) AS fecha,
            d.last_seen_at,
            d.playing_url,
            d.is_device_owner,
            d.kiosk_locked,
            d.idle_return_seconds,
            d.last_cleanup_result,
            d.mode,
            d.mode_since,
            d.maintenance_open,
            d.screen_lock_set,
            d.update_error,
            d.agent_version,
            d.app_removido_em,
            ( SELECT r.version FROM agent_releases r WHERE r.is_current LIMIT 1) AS versao_atual,
            ( SELECT r.created_at FROM agent_releases r WHERE r.is_current LIMIT 1) AS versao_desde,
            d.battery_level,
            d.battery_charging,
            d.fora_da_tomada_desde,
            d.temperature_c,
            d.protecoes,
            make_interval(secs => t_1.tolerancia_sem_contato_segundos::double precision) AS tolerancia
           FROM devices d
             LEFT JOIN stores s ON s.id = d.store_id
             JOIN tenants t_1 ON t_1.id = d.tenant_id
          WHERE d.is_active AND d.retirado_em IS NULL
        ), comh AS (
         SELECT base.*,
            (now() AT TIME ZONE base.tz)::time without time zone >= base.abre
            AND (now() AT TIME ZONE base.tz)::time without time zone <= base.fecha AS aberta
           FROM base
        )
 SELECT comh.device_id,
    comh.tenant_id,
    comh.code,
    comh.name,
    comh.loja,
    comh.store_id,
    comh.exclude_from_reports,
    comh.aberta,
    t.tipo,
    t.gravidade,
    t.detalhe
   FROM comh,
    LATERAL ( VALUES
      (comh.app_removido_em IS NOT NULL,'app_removido'::text,'critico'::text,
        (('o aplicativo foi removido deste aparelho em '::text || to_char((comh.app_removido_em AT TIME ZONE comh.tz), 'DD/MM'::text)) || ' às '::text) || to_char((comh.app_removido_em AT TIME ZONE comh.tz), 'HH24hMI'::text)),
      (comh.last_seen_at IS NULL OR comh.last_seen_at < (now() - comh.tolerancia),'fora_do_ar'::text,
        CASE WHEN comh.aberta THEN 'critico'::text ELSE 'atencao'::text END,
        CASE WHEN comh.last_seen_at IS NULL THEN 'nunca se conectou'::text
             ELSE ('sem contato há '::text || GREATEST(1, (EXTRACT(epoch FROM now() - comh.last_seen_at) / 60::numeric)::integer)) || ' min'::text END),
      (comh.last_seen_at >= (now() - comh.tolerancia) AND comh.playing_url IS NULL,'tela_vazia'::text,
        CASE WHEN comh.aberta THEN 'critico'::text ELSE 'atencao'::text END,
        'no ar, mas sem vídeo na tela'::text),
      (comh.device_type <> 'tv'::device_type
        AND NOT COALESCE(comh.maintenance_open, false)
        AND (NOT comh.is_device_owner OR COALESCE(protecao_de_pe(comh.protecoes), comh.kiosk_locked) = false),'sem_travas'::text,'atencao'::text,
        CASE WHEN NOT comh.is_device_owner THEN 'o aplicativo não está no controle do aparelho'::text
             WHEN comh.protecoes IS NOT NULL THEN COALESCE(protecoes_faltando(comh.protecoes), 'proteção incompleta'::text)
             ELSE 'dá para desligar o Wi-Fi ou ligar o modo avião'::text END),
      (comh.pode_atualizar_sozinho IS NOT NULL
        AND comh.pode_atualizar_sozinho = false
        AND NOT COALESCE(comh.is_device_owner, false)
        AND comh.last_seen_at >= (now() - comh.tolerancia),'nao_atualiza'::text,'atencao'::text,
        'não consegue instalar atualização sozinho; falta liberar a instalação de aplicativos neste aparelho'::text),
      (COALESCE(comh.screen_lock_set, false),'senha_de_tela'::text,'atencao'::text,
        'tem senha na tela de bloqueio; no próximo reinício a vitrine para'::text),
      (comh.update_error IS NOT NULL,'atualizacao_travada'::text,'atencao'::text,COALESCE(comh.update_error, ''::text)),
      (comh.battery_level IS NOT NULL AND comh.battery_level < 15 AND NOT COALESCE(comh.battery_charging, false),'bateria_baixa'::text,'atencao'::text,
        comh.battery_level || '% e fora da tomada'::text),
      (comh.temperature_c IS NOT NULL AND comh.temperature_c >= 45::numeric,'quente'::text,'atencao'::text,round(comh.temperature_c, 1) || ' °C'::text),
      (comh.store_id IS NULL,'sem_loja'::text,'atencao'::text,'sem loja definida, nenhuma campanha alcança este aparelho'::text),
      (COALESCE(comh.maintenance_open, false),'em_manutencao'::text,'atencao'::text,
        'aberto com o PIN de manutenção na loja; as proteções voltam sozinhas ao fim'::text),
      (comh.mode = 'main_menu'::device_mode AND comh.mode_since < (now() - GREATEST('00:15:00'::interval, make_interval(secs => (COALESCE(comh.idle_return_seconds, 30) * 3)::double precision))),'menu_parado'::text,
        CASE WHEN comh.aberta THEN 'critico'::text ELSE 'atencao'::text END,
        'parado no menu de testes; a campanha não está na tela'::text),
      (comh.device_type <> 'tv'::device_type
        AND COALESCE(comh.last_cleanup_result, ''::text) ~~ 'SEM PERMISSÃO%'::text,'faxina_sem_permissao'::text,'atencao'::text,
        'a faxina não apaga as fotos do cliente; falta liberar o acesso a arquivos pelo cabo'::text),
      (comh.model_id IS NULL AND comh.last_seen_at IS NOT NULL,'sem_modelo'::text,'atencao'::text,
        'sem modelo cadastrado: fica fora dos relatorios por modelo e da cobertura por linha'::text),
      -- AQUI ESTA O CONSERTO: so acusa quem esta ATRAS, nunca quem esta adiante.
      (public.versao_e_mais_velha(comh.agent_version, comh.versao_atual)
        AND comh.versao_desde < (now() - '02:00:00'::interval)
        AND comh.last_seen_at >= (now() - comh.tolerancia),'versao_atrasada'::text,'atencao'::text,
        (('continua na versao '::text || comh.agent_version) || ', e a publicada e a '::text) || comh.versao_atual),
      (comh.battery_charging IS FALSE AND comh.fora_da_tomada_desde IS NOT NULL AND comh.fora_da_tomada_desde < (now() - '00:30:00'::interval) AND comh.last_seen_at >= (now() - comh.tolerancia),'fora_da_tomada'::text,'atencao'::text,
        ('fora do carregador há '::text ||
          CASE WHEN (now() - comh.fora_da_tomada_desde) < '01:30:00'::interval THEN (EXTRACT(epoch FROM now() - comh.fora_da_tomada_desde) / 60::numeric)::integer::text || ' min'::text
               ELSE round(EXTRACT(epoch FROM now() - comh.fora_da_tomada_desde) / 3600.0)::text || ' h'::text END)
          || COALESCE((' ('::text || comh.battery_level) || '%)'::text, ''::text))
    ) t(vale, tipo, gravidade, detalhe)
  WHERE t.vale AND (comh.app_removido_em IS NULL OR t.tipo = 'app_removido'::text);

alter view public.v_device_issues set (security_invoker = on);
