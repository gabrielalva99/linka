-- View no Postgres roda, por padrão, com os privilégios de quem a criou — o que
-- IGNORA o RLS das tabelas por baixo. Do jeito que a migration anterior deixou,
-- qualquer usuário autenticado leria a interação de TODOS os tenants pela view.
-- Multi-tenant é o alicerce do produto; isso é bug de segurança, não de estilo.
alter view public.v_interaction_hourly set (security_invoker = true);

-- Recorte de negócio para o BI da ProSolution: já vem com rede, loja e cidade,
-- e a hora no fuso DA LOJA — relatório de varejo se lê em horário comercial
-- local, não em UTC (uma loja em Manaus fecharia "às 19h" num relatório UTC).
create view public.v_bi_interaction_hourly with (security_invoker = true) as
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
group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10;

comment on view public.v_bi_interaction_hourly is 'BI: o que o cliente usou. Tempo por recurso — não somar com v_bi_visits_hourly (os períodos se sobrepõem).';

-- "Quantas vezes pegaram o aparelho" é A métrica do varejo — e contá-la por tela
-- apagando e acendendo dá ZERO para sempre: a vitrine é justamente um aparelho
-- com a tela acesa o dia inteiro tocando vídeo. Confirmado no banco antes de
-- desenhar a tela: 14 eventos de uso, 0 de tela.
--
-- Uma visita é um BLOCO de uso separado por um intervalo de silêncio. O silêncio
-- é a vitrine tendo voltado sozinha (o retorno automático é de 30s por padrão):
-- 90s sem ninguém tocar em nada = a pessoa foi embora e a próxima é outra visita.
create view public.v_bi_visits_hourly with (security_invoker = true) as
with uso as (
  select
    e.tenant_id,
    e.device_id,
    e.started_at,
    e.ended_at,
    coalesce(e.duration_seconds, 0) as segundos,
    case
      when lag(e.ended_at) over (partition by e.device_id order by e.started_at) is null
        or e.started_at - lag(e.ended_at) over (partition by e.device_id order by e.started_at)
           > interval '90 seconds'
      then 1 else 0
    end as nova
  from public.device_events e
  left join public.app_catalog c on c.package = e.package
  where e.kind = 'app_usage'
    and coalesce(c.is_noise, false) = false
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
  from ilhas group by 1, 2, 3
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

comment on view public.v_bi_visits_hourly is 'BI: quantas pessoas pararam no aparelho e por quanto tempo. Visita = bloco de uso separado por 90s de silêncio.';

/**
 * A jornada de UM aparelho num dia, pronta para a tela: quantas visitas, o que
 * o cliente abriu e em que horas do dia.
 *
 * O dia é o dia DA LOJA. Uma consulta por fuso do servidor cortaria o expediente
 * no meio para lojas fora de São Paulo.
 */
create function public.device_journey(p_device_id uuid, p_day date default null)
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
      e.started_at,
      e.ended_at,
      coalesce(e.duration_seconds, 0) as segundos,
      coalesce(c.label, e.package)    as recurso,
      c.category                      as categoria
    from public.device_events e
    left join public.app_catalog c on c.package = e.package
    where e.device_id = p_device_id
      and e.kind = 'app_usage'
      and coalesce(c.is_noise, false) = false
      and e.started_at >= v_ini
      and e.started_at < v_fim
  ),
  -- Duas etapas porque o Postgres não aceita janela dentro de janela:
  -- primeiro marca onde começa cada visita, depois soma as marcas.
  marcado as (
    select *,
      case
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
  )
  select jsonb_build_object(
    'dia', v_day,
    'fuso', v_tz,
    'visitas', (select count(distinct visita) from ilhas),
    'segundos_uso', (select coalesce(sum(segundos), 0) from ev),
    'recursos', (
      select coalesce(jsonb_agg(x order by x.segundos desc), '[]'::jsonb)
      from (
        select recurso, categoria, count(*) as sessoes, sum(segundos) as segundos
        from ev group by 1, 2
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
          from ilhas group by visita
        ) v
        group by 1
      ) y
    )
  ) into v_out;

  return v_out;
end;
$$;

comment on function public.device_journey is 'Jornada do cliente num aparelho, no dia da loja. Roda com os privilégios de quem chama — o RLS continua valendo.';
