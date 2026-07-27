-- Faltava medir o outro lado da moeda: quanto tempo a VITRINE ficou rodando.
-- "O cliente mexeu 2min08" não diz nada sozinho — se foi em 8h de vídeo ou em
-- 30min é a diferença entre um ponto morto e um ponto que converte.
--
-- E resolve a fronteira da visita: antes ela era estimada por 90s de silêncio,
-- o que conta duas visitas quando a mesma pessoa para para assistir o vídeo e
-- volta a mexer. Com a vitrine reportando presença, a fronteira é medida.
alter type public.event_kind add value if not exists 'showcase';

/**
 * Jornada do cliente com os dois lados da moeda: quanto tempo a vitrine rodou
 * e quanto tempo alguém mexeu.
 *
 * O corte por 90s de silêncio continua valendo em paralelo — durante a
 * atualização da frota convivem aparelhos que já reportam a vitrine e aparelhos
 * que ainda não, e o número não pode mudar de significado no meio.
 */
create or replace function public.device_journey(p_device_id uuid, p_day date default null)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz  text;
  v_day date;
  v_ini timestamptz;
  v_fim timestamptz;
  v_out jsonb;
begin
  -- Sem linha aqui = aparelho de outro tenant (o RLS escondeu): devolve vazio.
  select coalesce(s.timezone, 'America/Sao_Paulo') into v_tz
  from public.devices d
  left join public.stores s on s.id = d.store_id
  where d.id = p_device_id;
  if v_tz is null then return null; end if;

  v_day := coalesce(p_day, (now() at time zone v_tz)::date);
  v_ini := (v_day::timestamp) at time zone v_tz;
  v_fim := ((v_day + 1)::timestamp) at time zone v_tz;

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
    select *,
      sum(nova) over (order by started_at rows unbounded preceding) as visita
    from marcado
  ),
  uso as (select * from ev where kind = 'app_usage')
  select jsonb_build_object(
    'dia', v_day,
    'fuso', v_tz,
    'visitas', (select count(distinct visita) from ilhas where kind = 'app_usage'),
    'segundos_uso', (select coalesce(sum(segundos), 0) from uso),
    'segundos_vitrine', (select coalesce(sum(segundos), 0) from ev where kind = 'showcase'),
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

comment on function public.device_journey is 'Jornada do cliente num aparelho, no dia da loja. Roda com os privilégios de quem chama — o RLS continua valendo.';

-- O BI também precisa do denominador: tempo de vitrine por hora é o que
-- transforma "8 visitas" em taxa de parada.
create view public.v_bi_showcase_hourly with (security_invoker = true) as
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
group by 1, 2, 3, 4, 5, 6, 7, 8;

comment on view public.v_bi_showcase_hourly is 'BI: tempo com a vitrine na tela. É o denominador — sem ele, contagem de visitas não vira taxa.';
