-- Estas quatro coisas foram aplicadas direto no banco e não existiam no repo.
-- A tela inicial depende de v_device_issues: um ambiente novo subia com a home
-- quebrada, e a função mais perigosa do banco (sync_device_alerts, que roda
-- ignorando o RLS) nunca passou por revisão porque não estava no código.
--
-- Ver também 20260728080000, que fecha os privilégios desta função.

/**
 * O que está errado agora, por aparelho. UMA regra, no banco.
 *
 * Fica aqui e não na tela porque quem pergunta são dois: o painel e o alerta.
 * Se cada um tivesse a sua definição de "problema", a loja receberia um aviso
 * dizendo que o aparelho caiu enquanto o painel mostra ele verde.
 *
 * "Durante o expediente" muda a gravidade, não o fato. Aparelho apagado às 3h
 * da manhã não é urgência; o mesmo aparelho apagado às 15h é dinheiro parado.
 */
create view public.v_device_issues with (security_invoker = true) as
with base as (
  select
    d.id as device_id, d.tenant_id, d.code, d.name, d.exclude_from_reports,
    s.name as loja,
    coalesce(s.timezone, 'America/Sao_Paulo') as tz,
    coalesce(s.opens_at, '09:00') as abre,
    coalesce(s.closes_at, '22:00') as fecha,
    d.last_seen_at, d.playing_url, d.is_device_owner, d.kiosk_locked,
    d.screen_lock_set, d.update_error, d.battery_level, d.battery_charging,
    d.temperature_c, d.store_id
  from public.devices d
  left join public.stores s on s.id = d.store_id
),
comh as (
  select *, (now() at time zone tz)::time between abre and fecha as aberta from base
)
select device_id, tenant_id, code, name, loja, exclude_from_reports, aberta,
       tipo, gravidade, detalhe
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

comment on view public.v_device_issues is 'Problemas por aparelho, uma regra só. O painel e o alerta leem daqui.';

-- Estado dos alertas: um aparelho fora do ar é UM alerta, não um aviso a cada
-- 5 minutos até alguém resolver. E quando volta, quem foi avisado precisa saber
-- que voltou, senão manda técnico para uma loja que já está no ar.
create table public.device_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  kind text not null,
  severity text not null,
  detail text,
  opened_at timestamptz not null default now(),
  notified_at timestamptz,
  closed_at timestamptz,
  closed_notified_at timestamptz
);

create unique index device_alerts_open
  on public.device_alerts (device_id, kind) where closed_at is null;
create index device_alerts_tenant on public.device_alerts (tenant_id, opened_at desc);

alter table public.device_alerts enable row level security;
create policy device_alerts_select on public.device_alerts
  for select using (private.has_tenant_access(tenant_id));

/**
 * Sincroniza os alertas com a realidade e devolve o que mudou.
 *
 * Roda no banco porque abrir e fechar tem que ser atômico: duas execuções ao
 * mesmo tempo não podem abrir dois alertas do mesmo problema, e o índice único
 * acima só protege se a decisão for aqui.
 *
 * SECURITY DEFINER e, por isso, SEM permissão para anônimo nem para usuário
 * logado: quem executa é o agendador. Ver 20260728080000.
 */
create function public.sync_device_alerts()
returns table (acao text, alert_id uuid, device_id uuid, device_name text,
               loja text, kind text, severity text, detail text)
language plpgsql
security definer
set search_path = public
as $fn$
#variable_conflict use_column
begin
  return query
  with fechados as (
    update public.device_alerts a set closed_at = now()
    where a.closed_at is null
      and not exists (select 1 from public.v_device_issues i
                      where i.device_id = a.device_id and i.tipo = a.kind)
    returning a.id, a.device_id, a.kind, a.severity, a.detail
  )
  select 'fechou'::text, f.id, f.device_id, d.name,
         coalesce(s.name, 'sem loja'), f.kind, f.severity, f.detail
  from fechados f
  join public.devices d on d.id = f.device_id
  left join public.stores s on s.id = d.store_id;

  -- Aparelho de bancada não gera alerta: ele existe para a gente quebrar.
  return query
  with novos as (
    insert into public.device_alerts (tenant_id, device_id, kind, severity, detail)
    select i.tenant_id, i.device_id, i.tipo, i.gravidade, i.detalhe
    from public.v_device_issues i
    where not i.exclude_from_reports
    on conflict (device_id, kind) where closed_at is null do nothing
    returning id, device_id, kind, severity, detail
  )
  select 'abriu'::text, n.id, n.device_id, d.name,
         coalesce(s.name, 'sem loja'), n.kind, n.severity, n.detail
  from novos n
  join public.devices d on d.id = n.device_id
  left join public.stores s on s.id = d.store_id;
end;
$fn$;

-- O painel lê a situação ao vivo, então a tela funciona sem isto. O que precisa
-- rodar sozinho é o REGISTRO: sem alguém abrindo o painel no sábado, ninguém
-- saberia depois que a loja passou o fim de semana fora do ar.
create extension if not exists pg_cron with schema extensions;
select cron.schedule('linka-alertas', '*/5 * * * *',
  $cron$select public.sync_device_alerts()$cron$);
