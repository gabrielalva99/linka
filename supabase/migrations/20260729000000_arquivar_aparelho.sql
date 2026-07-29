-- LINKA — arquivar aparelho que saiu de operação.
--
-- Roubado, quebrado, devolvido ao fabricante. Hoje ele aparece como "fora do ar"
-- todo santo dia, para sempre, e ninguém pode fazer nada a respeito. Alerta que
-- não tem como fechar é o jeito mais rápido de ensinar a equipe a ignorar a tela
-- de problemas inteira — e aí o aparelho que caiu de verdade some no meio do
-- ruído.
--
-- Arquivar NÃO apaga nada. O histórico de interação continua onde está: o que
-- ele mediu enquanto estava na loja aconteceu, e relatório de mês passado não
-- pode mudar porque o aparelho foi roubado ontem.
alter table public.devices
  add column archived_at    timestamptz,
  add column archive_reason text;

comment on column public.devices.archived_at is 'Quando saiu de operação. is_active = false é o efeito; isto é o registro.';
comment on column public.devices.archive_reason is 'Por quê (roubado, quebrado, devolvido). Vira a explicação na lista de arquivados.';

-- A view de problemas passa a ignorar aparelho arquivado. É aqui que o alerta
-- morre, e não na tela: o painel, o e-mail e o cron leem todos deste mesmo
-- lugar. Filtrar em cada consumidor seria três lugares para esquecer.
drop view public.v_device_issues;

create view public.v_device_issues with (security_invoker = true) as
with base as (
  select
    d.id as device_id, d.tenant_id, d.code, d.name, d.exclude_from_reports,
    d.store_id, s.name as loja,
    coalesce(s.timezone, 'America/Sao_Paulo') as tz,
    coalesce(s.opens_at, '09:00') as abre,
    coalesce(s.closes_at, '22:00') as fecha,
    d.last_seen_at, d.playing_url, d.is_device_owner, d.kiosk_locked,
    d.screen_lock_set, d.update_error, d.battery_level, d.battery_charging,
    d.temperature_c
  from public.devices d
  left join public.stores s on s.id = d.store_id
  where d.is_active
),
comh as (
  select *, (now() at time zone tz)::time between abre and fecha as aberta from base
)
select device_id, tenant_id, code, name, loja, store_id, exclude_from_reports,
       aberta, tipo, gravidade, detalhe
from comh, lateral (
  values
    (last_seen_at is null or last_seen_at < now() - interval '5 minutes',
     'fora_do_ar', case when aberta then 'critico' else 'atencao' end,
     case when last_seen_at is null then 'nunca se conectou'
          else 'sem contato há ' ||
            greatest(1, (extract(epoch from (now() - last_seen_at)) / 60)::int) || ' min' end),
    ((last_seen_at >= now() - interval '5 minutes') and playing_url is null,
     'tela_vazia', case when aberta then 'critico' else 'atencao' end,
     'no ar, mas sem vídeo na tela'),
    (not is_device_owner or not kiosk_locked,
     'sem_travas', 'atencao', 'dá para desligar o Wi-Fi ou ligar o modo avião'),
    (coalesce(screen_lock_set, false),
     'senha_de_tela', 'atencao',
     'tem senha na tela de bloqueio; no próximo reinício a vitrine para'),
    (update_error is not null,
     'atualizacao_travada', 'atencao', coalesce(update_error, '')),
    (battery_level is not null and battery_level < 15
       and not coalesce(battery_charging, false),
     'bateria_baixa', 'atencao', battery_level || '% e fora da tomada'),
    (temperature_c is not null and temperature_c >= 45,
     'quente', 'atencao', round(temperature_c, 1) || ' °C'),
    (store_id is null,
     'sem_loja', 'atencao',
     'sem loja definida, nenhuma campanha alcança este aparelho')
) as t(vale, tipo, gravidade, detalhe)
where t.vale;

comment on view public.v_device_issues is 'Problemas por aparelho, uma regra só — sem os arquivados. O painel e o alerta leem daqui.';
