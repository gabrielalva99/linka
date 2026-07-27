-- Aparelho de teste na nossa mesa gera visita, uso e vitrine igual a um aparelho
-- em loja. Sem separar, o relatório que vai para a Motorola soma número que
-- ninguém do varejo produziu — e um número inventado num relatório de cliente
-- custa mais caro que um número faltando.
--
-- O dado bruto CONTINUA sendo gravado: o aparelho de teste é onde a gente
-- descobre que a medição quebrou. O que muda é ele não entrar no relatório.
alter table public.devices
  add column exclude_from_reports boolean not null default false;

comment on column public.devices.exclude_from_reports is 'Aparelho de teste/bancada: sai dos relatórios e do BI, mas continua sendo medido.';

-- Os aparelhos que hoje existem são de teste (frota real ainda não instalada).
update public.devices set exclude_from_reports = true;

-- As quatro visões de relatório passam a filtrar o mesmo sinal. Fica no BANCO,
-- não em cada consulta: uma view nova que esquecesse o filtro reintroduziria
-- o número de teste sem ninguém notar.
create or replace view public.v_interaction_hourly with (security_invoker = true) as
select
  e.tenant_id,
  e.device_id,
  date_trunc('hour', e.started_at) as hora,
  coalesce(c.label, e.package)     as recurso,
  c.category                       as categoria,
  count(*)                         as sessoes,
  sum(e.duration_seconds)          as segundos
from public.device_events e
join public.devices d on d.id = e.device_id
left join public.app_catalog c on c.package = e.package
where e.kind = 'app_usage'
  and coalesce(c.is_noise, false) = false
  and not d.exclude_from_reports
group by 1, 2, 3, 4, 5;

create or replace view public.v_bi_interaction_hourly with (security_invoker = true) as
select
  e.tenant_id,
  ch.name  as rede,
  s.name   as loja,
  s.city   as cidade,
  s.state  as uf,
  d.code   as codigo,
  d.name   as aparelho,
  date_trunc('hour', e.started_at at time zone coalesce(s.timezone, 'America/Sao_Paulo')) as hora_local,
  coalesce(c.label, e.package) as recurso,
  c.category                   as categoria,
  count(*)                     as sessoes,
  sum(e.duration_seconds)      as segundos
from public.device_events e
join public.devices d on d.id = e.device_id
left join public.stores s on s.id = d.store_id
left join public.retail_chains ch on ch.id = s.chain_id
left join public.app_catalog c on c.package = e.package
where e.kind = 'app_usage'
  and coalesce(c.is_noise, false) = false
  and not d.exclude_from_reports
group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10;

create or replace view public.v_bi_showcase_hourly with (security_invoker = true) as
select
  e.tenant_id,
  ch.name  as rede,
  s.name   as loja,
  s.city   as cidade,
  s.state  as uf,
  d.code   as codigo,
  d.name   as aparelho,
  date_trunc('hour', e.started_at at time zone coalesce(s.timezone, 'America/Sao_Paulo')) as hora_local,
  sum(e.duration_seconds) as segundos_vitrine
from public.device_events e
join public.devices d on d.id = e.device_id
left join public.stores s on s.id = d.store_id
left join public.retail_chains ch on ch.id = s.chain_id
where e.kind = 'showcase'
  and not d.exclude_from_reports
  and (e.started_at at time zone coalesce(s.timezone, 'America/Sao_Paulo'))::time
      between coalesce(s.opens_at, '09:00') and coalesce(s.closes_at, '22:00')
group by 1, 2, 3, 4, 5, 6, 7, 8;

drop view if exists public.v_bi_visits_hourly;
create view public.v_bi_visits_hourly with (security_invoker = true) as
with uso as (
  select
    e.tenant_id,
    e.device_id,
    e.started_at,
    e.ended_at,
    coalesce(e.duration_seconds, 0) as segundos,
    case
      when e.kind = 'showcase' then 1
      when lag(e.ended_at) over (partition by e.device_id order by e.started_at) is null
        or e.started_at - lag(e.ended_at) over (partition by e.device_id order by e.started_at)
           > interval '90 seconds'
      then 1 else 0
    end as nova,
    e.kind::text as kind
  from public.device_events e
  join public.devices d on d.id = e.device_id
  left join public.app_catalog c on c.package = e.package
  where e.kind in ('app_usage', 'showcase')
    and (e.kind <> 'app_usage' or coalesce(c.is_noise, false) = false)
    and not d.exclude_from_reports
),
ilhas as (
  select *,
    sum(nova) over (
      partition by device_id order by started_at rows unbounded preceding
    ) as visita
  from uso
),
visitas as (
  select tenant_id, device_id, visita,
         min(started_at) as inicio,
         sum(segundos)   as segundos
  from ilhas where kind = 'app_usage' group by 1, 2, 3
)
select
  v.tenant_id,
  ch.name  as rede,
  s.name   as loja,
  s.city   as cidade,
  s.state  as uf,
  d.code   as codigo,
  d.name   as aparelho,
  date_trunc('hour', v.inicio at time zone coalesce(s.timezone, 'America/Sao_Paulo')) as hora_local,
  count(*)         as visitas,
  sum(v.segundos)  as segundos_uso
from visitas v
join public.devices d on d.id = v.device_id
left join public.stores s on s.id = d.store_id
left join public.retail_chains ch on ch.id = s.chain_id
group by 1, 2, 3, 4, 5, 6, 7, 8;

comment on view public.v_bi_visits_hourly is 'BI: quantas pessoas pararam no aparelho e por quanto tempo. Aparelho de teste fica de fora.';
