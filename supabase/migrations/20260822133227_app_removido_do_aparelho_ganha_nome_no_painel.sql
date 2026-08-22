-- O painel passa a saber a diferenca entre "sumiu" e "foi removido".
--
-- Ao tirar o dono do aparelho e desinstalar o app do tablet 117 (21/08 19h40), o
-- painel abriu TRES alertas vermelhos: "nao esta no controle do aparelho",
-- "parado no menu de testes" e "sem contato". Cada um correto por si, e nenhum
-- deles dizendo a unica coisa que importava: alguem tirou o app dali.
--
-- Quem abrisse o painel no dia seguinte concluiria que um aparelho quebrou na
-- loja. O sinal existia (o app avisa o servidor antes de morrer); faltava o
-- painel dar nome a ele.
--
-- NAO arquiva sozinho. Numa loja, app removido e grave: o alerta continua de pe
-- ate alguem confirmar no painel. O que muda e que agora ele explica.
alter table public.devices
  add column if not exists app_removido_em timestamptz;

comment on column public.devices.app_removido_em is
  'Quando o aplicativo deixou de ser dono deste aparelho por remocao. Nulo enquanto o app esta no controle. Preenchido pela batida quando o cargo cai de dono para nao-dono, e limpo sozinho se o aparelho for provisionado de novo.';

create or replace view public.v_device_issues as
 WITH base AS (
         SELECT d.id AS device_id,
            d.tenant_id,
            d.code,
            d.name,
            d.exclude_from_reports,
            d.model_id,
            d.store_id,
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
            ( SELECT r.version
                   FROM agent_releases r
                  WHERE r.is_current
                 LIMIT 1) AS versao_atual,
            ( SELECT r.created_at
                   FROM agent_releases r
                  WHERE r.is_current
                 LIMIT 1) AS versao_desde,
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
            (now() AT TIME ZONE base.tz)::time without time zone >= base.abre AND (now() AT TIME ZONE base.tz)::time without time zone <= base.fecha AS aberta
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
      -- PRIMEIRO da lista de proposito: e o unico que sobrevive ao filtro do
      -- final quando o app foi removido, e ler a origem de cima para baixo
      -- ajuda a entender por que os outros somem.
      (comh.app_removido_em IS NOT NULL,'app_removido'::text,'critico'::text,
                ('o aplicativo foi removido deste aparelho em '::text
                  || to_char(comh.app_removido_em AT TIME ZONE comh.tz, 'DD/MM'::text)
                  || ' às '::text
                  || to_char(comh.app_removido_em AT TIME ZONE comh.tz, 'HH24hMI'::text))),
      (comh.last_seen_at IS NULL OR comh.last_seen_at < (now() - comh.tolerancia),'fora_do_ar'::text,
                CASE
                    WHEN comh.aberta THEN 'critico'::text
                    ELSE 'atencao'::text
                END,
                CASE
                    WHEN comh.last_seen_at IS NULL THEN 'nunca se conectou'::text
                    ELSE ('sem contato há '::text || GREATEST(1, (EXTRACT(epoch FROM now() - comh.last_seen_at) / 60::numeric)::integer)) || ' min'::text
                END),
      (comh.last_seen_at >= (now() - comh.tolerancia) AND comh.playing_url IS NULL,'tela_vazia'::text,
                CASE
                    WHEN comh.aberta THEN 'critico'::text
                    ELSE 'atencao'::text
                END,'no ar, mas sem vídeo na tela'::text),
      (NOT COALESCE(comh.maintenance_open, false) AND (NOT comh.is_device_owner OR COALESCE(protecao_de_pe(comh.protecoes), comh.kiosk_locked) = false),'sem_travas'::text,'atencao'::text,
                CASE
                    WHEN NOT comh.is_device_owner THEN 'o aplicativo não está no controle do aparelho'::text
                    WHEN comh.protecoes IS NOT NULL THEN COALESCE(protecoes_faltando(comh.protecoes), 'proteção incompleta'::text)
                    ELSE 'dá para desligar o Wi-Fi ou ligar o modo avião'::text
                END),
      (COALESCE(comh.screen_lock_set, false),'senha_de_tela'::text,'atencao'::text,'tem senha na tela de bloqueio; no próximo reinício a vitrine para'::text),
      (comh.update_error IS NOT NULL,'atualizacao_travada'::text,'atencao'::text,COALESCE(comh.update_error, ''::text)),
      (comh.battery_level IS NOT NULL AND comh.battery_level < 15 AND NOT COALESCE(comh.battery_charging, false),'bateria_baixa'::text,'atencao'::text,comh.battery_level || '% e fora da tomada'::text),
      (comh.temperature_c IS NOT NULL AND comh.temperature_c >= 45::numeric,'quente'::text,'atencao'::text,round(comh.temperature_c, 1) || ' °C'::text),
      (comh.store_id IS NULL,'sem_loja'::text,'atencao'::text,'sem loja definida, nenhuma campanha alcança este aparelho'::text),
      (COALESCE(comh.maintenance_open, false),'em_manutencao'::text,'atencao'::text,'aberto com o PIN de manutenção na loja; as proteções voltam sozinhas ao fim'::text),
      (comh.mode = 'main_menu'::device_mode AND comh.mode_since < (now() - GREATEST('00:15:00'::interval, make_interval(secs => (COALESCE(comh.idle_return_seconds, 30) * 3)::double precision))),'menu_parado'::text,
                CASE
                    WHEN comh.aberta THEN 'critico'::text
                    ELSE 'atencao'::text
                END,'parado no menu de testes; a campanha não está na tela'::text),
      (COALESCE(comh.last_cleanup_result, ''::text) ~~ 'SEM PERMISSÃO%'::text,'faxina_sem_permissao'::text,'atencao'::text,'a faxina não apaga as fotos do cliente; falta liberar o acesso a arquivos pelo cabo'::text),
      (comh.model_id IS NULL AND comh.last_seen_at IS NOT NULL,'sem_modelo'::text,'atencao'::text,'sem modelo cadastrado: fica fora dos relatorios por modelo e da cobertura por linha'::text),
      (comh.versao_atual IS NOT NULL AND comh.agent_version IS NOT NULL AND comh.agent_version <> comh.versao_atual AND comh.versao_desde < (now() - '02:00:00'::interval) AND comh.last_seen_at >= (now() - comh.tolerancia),'versao_atrasada'::text,'atencao'::text,(('continua na versao '::text || comh.agent_version) || ', e a publicada e a '::text) || comh.versao_atual),
      (comh.battery_charging IS FALSE AND comh.fora_da_tomada_desde IS NOT NULL AND comh.fora_da_tomada_desde < (now() - '00:30:00'::interval) AND comh.last_seen_at >= (now() - comh.tolerancia),'fora_da_tomada'::text,'atencao'::text,('fora do carregador há '::text ||
                CASE
                    WHEN (now() - comh.fora_da_tomada_desde) < '01:30:00'::interval THEN (EXTRACT(epoch FROM now() - comh.fora_da_tomada_desde) / 60::numeric)::integer::text || ' min'::text
                    ELSE round(EXTRACT(epoch FROM now() - comh.fora_da_tomada_desde) / 3600.0)::text || ' h'::text
                END) || COALESCE((' ('::text || comh.battery_level) || '%)'::text, ''::text))
    ) t(vale, tipo, gravidade, detalhe)
  WHERE t.vale
    -- APARELHO SEM APP FALA UMA COISA SO.
    --
    -- Sem esta linha o 117 continuaria com tres alertas: o app removido, o "sem
    -- contato" (obvio, foi desinstalado) e o "parado no menu" (o ultimo estado
    -- que ele reportou, congelado para sempre). Ruido em cima de um fato ja
    -- explicado, e ruido que nunca fecha sozinho, porque nao existe mais
    -- ninguem do outro lado para reportar que melhorou.
    AND (comh.app_removido_em IS NULL OR t.tipo = 'app_removido');
