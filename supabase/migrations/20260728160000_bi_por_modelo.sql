-- LINKA — o corte que faltava no BI: MODELO.
--
-- As views de BI saíam com CÓDIGO e APELIDO do aparelho. São dois rótulos de
-- inventário: servem para achar o aparelho na prateleira, não para decidir nada.
-- Nenhuma pergunta de venda se responde com eles.
--
-- A pergunta da marca é outra: qual MODELO chama mais atenção, em que região, e
-- qual recurso o cliente procura NELE. "Razr engaja mais que o G06?", "no
-- interior o cliente abre câmera e na capital abre jogo?" — nada disso saía.
-- O vínculo aparelho → modelo sempre existiu no cadastro; só nunca chegou ao
-- relatório.
--
-- Entra junto o tipo de local (shopping x rua), que também já estava no cadastro
-- e nunca chegou ao BI. É o corte "Interações por Local" do catálogo de dados —
-- fluxo de shopping e fluxo de rua não se comparam sem essa coluna.
--
-- As views são recriadas em vez de alteradas: o Postgres não deixa INSERIR
-- coluna no meio de uma view existente, e colunas de recorte penduradas no fim,
-- depois das medidas, deixam a planilha ilegível para quem lê.

drop view if exists public.v_bi_interaction_hourly;
create view public.v_bi_interaction_hourly with (security_invoker = true) as
select
  e.tenant_id,
  ch.name as rede,
  s.name  as loja,
  s.city  as cidade,
  s.state as uf,
  case s.kind
    when 'shopping' then 'Shopping'
    when 'street'   then 'Rua'
    else 'Outro'
  end     as tipo_local,
  d.code  as codigo,
  d.name  as aparelho,
  m.name  as modelo,
  m.line  as linha,
  date_trunc('hour', e.started_at at time zone coalesce(s.timezone, 'America/Sao_Paulo')) as hora_local,
  coalesce(c.label, e.package) as recurso,
  c.category                   as categoria,
  count(*)                     as sessoes,
  sum(e.duration_seconds)      as segundos
from public.device_events e
join public.devices d on d.id = e.device_id
left join public.device_models m on m.id = d.model_id
left join public.stores s on s.id = d.store_id
left join public.retail_chains ch on ch.id = s.chain_id
left join public.app_catalog c on c.package = e.package
where e.kind = 'app_usage'
  and coalesce(c.is_noise, false) = false
  and not d.exclude_from_reports
group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13;

comment on view public.v_bi_interaction_hourly is 'BI: o que o cliente usou, por modelo/linha e tipo de local. Não somar com v_bi_visits_hourly (os períodos se sobrepõem).';

drop view if exists public.v_bi_showcase_hourly;
create view public.v_bi_showcase_hourly with (security_invoker = true) as
select
  e.tenant_id,
  ch.name as rede,
  s.name  as loja,
  s.city  as cidade,
  s.state as uf,
  case s.kind
    when 'shopping' then 'Shopping'
    when 'street'   then 'Rua'
    else 'Outro'
  end     as tipo_local,
  d.code  as codigo,
  d.name  as aparelho,
  m.name  as modelo,
  m.line  as linha,
  date_trunc('hour', e.started_at at time zone coalesce(s.timezone, 'America/Sao_Paulo')) as hora_local,
  sum(e.duration_seconds) as segundos_vitrine
from public.device_events e
join public.devices d on d.id = e.device_id
left join public.device_models m on m.id = d.model_id
left join public.stores s on s.id = d.store_id
left join public.retail_chains ch on ch.id = s.chain_id
where e.kind = 'showcase'
  and not d.exclude_from_reports
  and (e.started_at at time zone coalesce(s.timezone, 'America/Sao_Paulo'))::time
      between coalesce(s.opens_at, '09:00') and coalesce(s.closes_at, '22:00')
group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11;

comment on view public.v_bi_showcase_hourly is 'BI: tempo com a vitrine na tela, dentro do expediente. É o denominador — sem ele, contagem de visitas não vira taxa.';

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
  ch.name as rede,
  s.name  as loja,
  s.city  as cidade,
  s.state as uf,
  case s.kind
    when 'shopping' then 'Shopping'
    when 'street'   then 'Rua'
    else 'Outro'
  end     as tipo_local,
  d.code  as codigo,
  d.name  as aparelho,
  m.name  as modelo,
  m.line  as linha,
  date_trunc('hour', v.inicio at time zone coalesce(s.timezone, 'America/Sao_Paulo')) as hora_local,
  count(*)        as visitas,
  sum(v.segundos) as segundos_uso
from visitas v
join public.devices d on d.id = v.device_id
left join public.device_models m on m.id = d.model_id
left join public.stores s on s.id = d.store_id
left join public.retail_chains ch on ch.id = s.chain_id
group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11;

comment on view public.v_bi_visits_hourly is 'BI: quantas pessoas pararam no aparelho e por quanto tempo, por modelo/linha. Aparelho de teste fica de fora.';
