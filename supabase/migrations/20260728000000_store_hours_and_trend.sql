-- A vitrine fica acesa 24h (o app segura a tela ligada de propósito). Sem saber
-- quando a loja abre, o tempo de vitrine incha a noite inteira e a taxa de
-- parada despenca por um motivo que não existe: ninguém passou porque a loja
-- estava fechada.
--
-- Horário é da LOJA, não global: shopping abre 10h, rua abre 9h.
-- Assume expediente dentro do mesmo dia — loja de shopping não vira a noite.
alter table public.stores
  add column opens_at time not null default '09:00',
  add column closes_at time not null default '22:00';

comment on column public.stores.opens_at is 'Início do expediente, hora local da loja. Recorta o denominador dos relatórios.';
comment on column public.stores.closes_at is 'Fim do expediente, hora local da loja.';

/**
 * Jornada do cliente: dia da loja, dentro do expediente da loja, com a média
 * dos 7 dias anteriores ao lado.
 *
 * Duas correções que mudam o número, não a apresentação:
 *
 * 1. O tempo de vitrine é RECORTADO pelo expediente. Testado nos quatro casos:
 *    sessão 21h→9h vira 1h; madrugada inteira vira zero.
 * 2. Um número sozinho não se julga. "6 visitas" só quer dizer alguma coisa ao
 *    lado da média desse mesmo aparelho — comparar com outra loja seria comparar
 *    fluxo de rua, não desempenho da vitrine.
 */
create or replace function public.device_journey(p_device_id uuid, p_day date default null)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz    text;
  v_abre  time;
  v_fecha time;
  v_day   date;
  v_ini   timestamptz;
  v_fim   timestamptz;
  v_jan_i timestamptz;
  v_jan_f timestamptz;
  v_out   jsonb;
begin
  -- Sem linha aqui = aparelho de outro tenant (o RLS escondeu): devolve vazio.
  select coalesce(s.timezone, 'America/Sao_Paulo'),
         coalesce(s.opens_at, '09:00'),
         coalesce(s.closes_at, '22:00')
    into v_tz, v_abre, v_fecha
  from public.devices d
  left join public.stores s on s.id = d.store_id
  where d.id = p_device_id;
  if v_tz is null then return null; end if;

  v_day := coalesce(p_day, (now() at time zone v_tz)::date);
  v_ini := (v_day::timestamp) at time zone v_tz;
  v_fim := ((v_day + 1)::timestamp) at time zone v_tz;
  v_jan_i := ((v_day + v_abre)::timestamp) at time zone v_tz;
  v_jan_f := ((v_day + v_fecha)::timestamp) at time zone v_tz;

  with ev as (
    select
      e.kind::text                    as kind,
      e.started_at,
      e.ended_at,
      coalesce(e.duration_seconds, 0) as segundos,
      coalesce(c.label, e.package)    as recurso,
      c.category                      as categoria
    from public.device_events e
    left join public.app_catalog c on c.package = e.package
    where e.device_id = p_device_id
      and e.kind in ('app_usage', 'showcase')
      and (e.kind <> 'app_usage' or coalesce(c.is_noise, false) = false)
      and e.started_at >= v_ini
      and e.started_at < v_fim
  ),
  -- Duas etapas porque o Postgres não aceita janela dentro de janela:
  -- primeiro marca onde começa cada visita, depois soma as marcas.
  marcado as (
    select *,
      case
        when kind = 'showcase' then 1
        when lag(ended_at) over (order by started_at) is null
          or started_at - lag(ended_at) over (order by started_at) > interval '90 seconds'
        then 1 else 0
      end as nova
    from ev
  ),
  ilhas as (
    select *, sum(nova) over (order by started_at rows unbounded preceding) as visita
    from marcado
  ),
  uso as (select * from ev where kind = 'app_usage'),
  -- Sessão de vitrine que atravessa a abertura ou o fechamento conta só o
  -- pedaço dentro do expediente.
  vitrine as (
    select greatest(0, extract(epoch from (
      least(coalesce(ended_at, v_jan_f), v_jan_f) - greatest(started_at, v_jan_i)
    )))::bigint as segundos
    from ev where kind = 'showcase'
  ),
  -- Mesmo cálculo de visita, dia a dia, nos 7 dias anteriores.
  ev7 as (
    select
      e.kind::text as kind,
      e.started_at,
      e.ended_at,
      coalesce(e.duration_seconds, 0) as segundos,
      (e.started_at at time zone v_tz)::date as dia
    from public.device_events e
    left join public.app_catalog c on c.package = e.package
    where e.device_id = p_device_id
      and e.kind in ('app_usage', 'showcase')
      and (e.kind <> 'app_usage' or coalesce(c.is_noise, false) = false)
      and e.started_at >= v_ini - interval '7 days'
      and e.started_at < v_ini
  ),
  marc7 as (
    select *,
      case
        when kind = 'showcase' then 1
        when lag(ended_at) over (partition by dia order by started_at) is null
          or started_at - lag(ended_at) over (partition by dia order by started_at)
             > interval '90 seconds'
        then 1 else 0
      end as nova
    from ev7
  ),
  ilhas7 as (
    select *,
      sum(nova) over (partition by dia order by started_at rows unbounded preceding) as visita
    from marc7
  ),
  dias7 as (
    select dia, count(distinct visita) as visitas, sum(segundos) as segundos
    from ilhas7 where kind = 'app_usage' group by dia
  )
  select jsonb_build_object(
    'dia', v_day,
    'fuso', v_tz,
    'abre', extract(hour from v_abre)::int,
    'fecha', extract(hour from v_fecha)::int,
    'visitas', (select count(distinct visita) from ilhas where kind = 'app_usage'),
    'segundos_uso', (select coalesce(sum(segundos), 0) from uso),
    'segundos_vitrine', (select coalesce(sum(segundos), 0) from vitrine),
    'media_visitas', (select round(avg(visitas), 1) from dias7),
    'media_segundos_uso', (select round(avg(segundos)) from dias7),
    'dias_comparados', (select count(*) from dias7),
    'recursos', (
      select coalesce(jsonb_agg(x order by x.segundos desc), '[]'::jsonb)
      from (
        select recurso, categoria, count(*) as sessoes, sum(segundos) as segundos
        from uso group by 1, 2
      ) x
    ),
    'horas', (
      select coalesce(jsonb_agg(y order by y.hora), '[]'::jsonb)
      from (
        select
          extract(hour from (inicio at time zone v_tz))::int as hora,
          count(*)      as visitas,
          sum(segundos) as segundos
        from (
          select visita, min(started_at) as inicio, sum(segundos) as segundos
          from ilhas where kind = 'app_usage' group by visita
        ) v
        group by 1
      ) y
    )
  ) into v_out;

  return v_out;
end;
$$;

comment on function public.device_journey is 'Jornada do cliente num aparelho, no dia e no expediente da loja. Roda com os privilégios de quem chama — o RLS continua valendo.';

-- O BI recebe o mesmo recorte: madrugada não é exposição.
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
  and (e.started_at at time zone coalesce(s.timezone, 'America/Sao_Paulo'))::time
      between coalesce(s.opens_at, '09:00') and coalesce(s.closes_at, '22:00')
group by 1, 2, 3, 4, 5, 6, 7, 8;

comment on view public.v_bi_showcase_hourly is 'BI: tempo com a vitrine na tela, dentro do expediente. É o denominador — sem ele, contagem de visitas não vira taxa.';
