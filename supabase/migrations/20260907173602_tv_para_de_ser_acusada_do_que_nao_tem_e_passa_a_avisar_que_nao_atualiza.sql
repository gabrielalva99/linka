-- A TV parava de fazer sentido no painel, de dois jeitos ao mesmo tempo.
--
-- ── OS DOIS ALARMES FALSOS ──────────────────────────────────────────────────
-- O box 120 (Android TV) aparecia com `sem_travas` ("o aplicativo nao esta no
-- controle do aparelho") e `faxina_sem_permissao` ("a faxina nao apaga as fotos
-- do cliente"). Os dois sao permanentes e insoluveis nesse hardware: a build de
-- Android TV vem sem `device_admin`, entao a TV NUNCA vira dona do aparelho, e
-- ninguem tira foto num box de TV. Toda TV em loja ficaria vermelha para sempre.
-- E a casa ja conhece o estrago disso: e o mesmo padrao do alerta de bateria que
-- nunca fechava (BACKLOG R2), que some do radar justamente quando importa.
--
-- Pela ADR-11 a TV e vitrine pura: nao ha cliente mexendo, nao ha o que travar e
-- nao ha foto para apagar. Entao os dois deixam de valer para `device_type = tv`.
--
-- ── O ALARME QUE FALTAVA, e esse e o que importa ───────────────────────────
-- Sem ser dona do aparelho, a TV so se atualiza se o appop de instalar
-- aplicativos estiver concedido (o `preparar-box.sh` concede e grava). Se a
-- preparacao falhar, o box fica congelado na versao com que foi instalado e
-- ninguem descobre: nao ha erro, nao ha queda, so uma loja velha. `nao_atualiza`
-- troca essa falha silenciosa por uma visivel.
--
-- So acusa quem REPORTA o campo: agente antigo manda nulo e nao vira alarme, o
-- que evita acender 250 aparelhos de mao no dia da publicacao.
alter table public.devices
  add column if not exists pode_atualizar_sozinho boolean;

comment on column public.devices.pode_atualizar_sozinho is
  'O agente consegue instalar atualizacao sem confirmacao na tela. Verdadeiro para dono do aparelho ou para quem tem o appop REQUEST_INSTALL_PACKAGES concedido (caso da TV). Nulo = agente antigo, que nao reporta.';

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
      -- SEM TRAVAS: nao vale para TV. Ela nunca vira dona do aparelho (build sem
      -- device_admin), entao acusar seria acusar todo dia, para sempre, uma coisa
      -- que ninguem pode consertar. ADR-11: TV e vitrine pura, sem o que travar.
      (comh.device_type <> 'tv'::device_type
        AND NOT COALESCE(comh.maintenance_open, false)
        AND (NOT comh.is_device_owner OR COALESCE(protecao_de_pe(comh.protecoes), comh.kiosk_locked) = false),'sem_travas'::text,'atencao'::text,
        CASE WHEN NOT comh.is_device_owner THEN 'o aplicativo não está no controle do aparelho'::text
             WHEN comh.protecoes IS NOT NULL THEN COALESCE(protecoes_faltando(comh.protecoes), 'proteção incompleta'::text)
             ELSE 'dá para desligar o Wi-Fi ou ligar o modo avião'::text END),
      -- NAO ATUALIZA: o alarme que a TV precisa de verdade. Sem dono e sem o
      -- appop de instalar, o box congela na versao e nada avisa. Nulo (agente
      -- antigo) nao acusa, para a publicacao nao acender a frota inteira.
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
      -- FAXINA: idem. Nao existe foto de cliente num box de TV para apagar.
      (comh.device_type <> 'tv'::device_type
        AND COALESCE(comh.last_cleanup_result, ''::text) ~~ 'SEM PERMISSÃO%'::text,'faxina_sem_permissao'::text,'atencao'::text,
        'a faxina não apaga as fotos do cliente; falta liberar o acesso a arquivos pelo cabo'::text),
      (comh.model_id IS NULL AND comh.last_seen_at IS NOT NULL,'sem_modelo'::text,'atencao'::text,
        'sem modelo cadastrado: fica fora dos relatorios por modelo e da cobertura por linha'::text),
      (comh.versao_atual IS NOT NULL AND comh.agent_version IS NOT NULL AND comh.agent_version <> comh.versao_atual AND comh.versao_desde < (now() - '02:00:00'::interval) AND comh.last_seen_at >= (now() - comh.tolerancia),'versao_atrasada'::text,'atencao'::text,
        (('continua na versao '::text || comh.agent_version) || ', e a publicada e a '::text) || comh.versao_atual),
      (comh.battery_charging IS FALSE AND comh.fora_da_tomada_desde IS NOT NULL AND comh.fora_da_tomada_desde < (now() - '00:30:00'::interval) AND comh.last_seen_at >= (now() - comh.tolerancia),'fora_da_tomada'::text,'atencao'::text,
        ('fora do carregador há '::text ||
          CASE WHEN (now() - comh.fora_da_tomada_desde) < '01:30:00'::interval THEN (EXTRACT(epoch FROM now() - comh.fora_da_tomada_desde) / 60::numeric)::integer::text || ' min'::text
               ELSE round(EXTRACT(epoch FROM now() - comh.fora_da_tomada_desde) / 3600.0)::text || ' h'::text END)
          || COALESCE((' ('::text || comh.battery_level) || '%)'::text, ''::text))
    ) t(vale, tipo, gravidade, detalhe)
  WHERE t.vale AND (comh.app_removido_em IS NULL OR t.tipo = 'app_removido'::text);

-- `create or replace view` NAO preserva security_invoker. Ja custou uma falha de
-- isolamento nesta casa (migration de 28/08), entao a linha e obrigatoria e a
-- verificacao logo abaixo tambem.
alter view public.v_device_issues set (security_invoker = on);
