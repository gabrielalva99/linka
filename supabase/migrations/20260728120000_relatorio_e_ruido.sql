-- Pacote que o cliente NÃO consegue abrir não é recurso, é encanamento.
--
-- O primeiro relatório da frota mostrou "com.android.settings.intelligence",
-- "com.motorola.ccc.ota" e "com.google.android.gms" como se fossem coisas que o
-- visitante escolheu usar. Nenhum deles tem ícone; é serviço interno que ganhou
-- foco por um instante.
--
-- Antes a única defesa era a marca is_noise no catálogo, escrita à mão: cada
-- modelo novo traria pacotes novos e o relatório da Motorola sujaria de novo,
-- em silêncio. Agora a regra usa o INVENTÁRIO, que o aparelho já reporta: o que
-- nunca apareceu como app abrível em nenhum aparelho não entra no relatório.
--
-- O catálogo continua mandando quando o pacote está lá: ele é a exceção
-- explícita, para esconder algo que É abrível.
create function public.package_is_noise(p_package text)
returns boolean
language sql
stable
set search_path = public
as $fn$
  select case
    when p_package is null then true
    when exists (select 1 from public.app_catalog c where c.package = p_package)
      then (select c.is_noise from public.app_catalog c where c.package = p_package)
    else not exists (select 1 from public.device_apps a where a.package = p_package)
  end;
$fn$;

comment on function public.package_is_noise is 'Pacote sem ícone em nenhum aparelho é encanamento, não recurso. O catálogo tem a palavra final quando o pacote está lá.';

create or replace view public.v_interaction_hourly with (security_invoker = true) as
select
  e.tenant_id, e.device_id,
  date_trunc('hour', e.started_at) as hora,
  coalesce(c.label, e.package) as recurso,
  c.category as categoria,
  count(*) as sessoes,
  sum(e.duration_seconds) as segundos
from public.device_events e
join public.devices d on d.id = e.device_id
left join public.app_catalog c on c.package = e.package
where e.kind = 'app_usage'
  and not public.package_is_noise(e.package)
  and not d.exclude_from_reports
group by 1, 2, 3, 4, 5;

create or replace view public.v_bi_interaction_hourly with (security_invoker = true) as
select
  e.tenant_id,
  ch.name as rede, s.name as loja, s.city as cidade, s.state as uf,
  d.code as codigo, d.name as aparelho,
  date_trunc('hour', e.started_at at time zone coalesce(s.timezone, 'America/Sao_Paulo')) as hora_local,
  coalesce(c.label, e.package) as recurso,
  c.category as categoria,
  count(*) as sessoes,
  sum(e.duration_seconds) as segundos
from public.device_events e
join public.devices d on d.id = e.device_id
left join public.stores s on s.id = d.store_id
left join public.retail_chains ch on ch.id = s.chain_id
left join public.app_catalog c on c.package = e.package
where e.kind = 'app_usage'
  and not public.package_is_noise(e.package)
  and not d.exclude_from_reports
group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10;

/**
 * A visão que junta: frota inteira, por período.
 *
 * Até agora o dado de interação só existia dentro de UM aparelho. Ninguém
 * conseguia responder "como foi a semana", "qual loja converte mais" ou "o que
 * o visitante mais abre", que são as perguntas de quem apresenta o resultado
 * para a marca.
 *
 * Lê das mesmas views que o BI consome, e não do evento cru: uma segunda
 * definição de "visita" faria a tela discordar da planilha que vai para a
 * Motorola, e aí ninguém confia em nenhuma das duas.
 */
create function public.fleet_report(p_days int default 7)
returns jsonb
language plpgsql
stable
set search_path = public
as $fn$
declare
  v_desde timestamptz;
  v_out jsonb;
begin
  v_desde := date_trunc('day', now()) - make_interval(days => greatest(1, p_days) - 1);

  with visitas as (
    select * from public.v_bi_visits_hourly where hora_local >= v_desde
  ),
  uso as (
    select * from public.v_bi_interaction_hourly where hora_local >= v_desde
  ),
  vitrine as (
    select * from public.v_bi_showcase_hourly where hora_local >= v_desde
  ),
  -- Vitrine por loja sai como sua própria agregação. Buscá-la dentro do group
  -- by da loja seria subconsulta correlacionada com coluna não agrupada, que o
  -- Postgres recusa.
  vitrine_loja as (
    select coalesce(loja, 'sem loja') as loja, sum(segundos_vitrine) as segundos
    from vitrine group by 1
  ),
  loja as (
    select coalesce(v.loja, 'sem loja') as loja,
           coalesce(v.rede, 'sem rede') as rede,
           sum(v.visitas) as visitas,
           sum(v.segundos_uso) as segundos
    from visitas v group by 1, 2
  )
  select jsonb_build_object(
    'dias', greatest(1, p_days),
    'visitas', (select coalesce(sum(visitas), 0) from visitas),
    'segundos_uso', (select coalesce(sum(segundos_uso), 0) from visitas),
    'segundos_vitrine', (select coalesce(sum(segundos_vitrine), 0) from vitrine),
    'lojas_com_dado', (select count(*) from loja),
    'por_loja', (
      select coalesce(jsonb_agg(x order by x.visitas desc), '[]'::jsonb)
      from (
        select l.loja, l.rede, l.visitas, l.segundos,
               coalesce(vl.segundos, 0) as segundos_vitrine
        from loja l left join vitrine_loja vl on vl.loja = l.loja
      ) x
    ),
    'por_rede', (
      select coalesce(jsonb_agg(x order by x.visitas desc), '[]'::jsonb)
      from (select rede, sum(visitas) as visitas, sum(segundos) as segundos
            from loja group by 1) x
    ),
    'por_recurso', (
      select coalesce(jsonb_agg(x order by x.segundos desc), '[]'::jsonb)
      from (select recurso, categoria, sum(sessoes) as sessoes, sum(segundos) as segundos
            from uso group by 1, 2) x
    ),
    'por_dia', (
      select coalesce(jsonb_agg(x order by x.dia), '[]'::jsonb)
      from (select hora_local::date as dia, sum(visitas) as visitas,
                   sum(segundos_uso) as segundos
            from visitas group by 1) x
    ),
    'por_hora', (
      select coalesce(jsonb_agg(x order by x.hora), '[]'::jsonb)
      from (select extract(hour from hora_local)::int as hora, sum(visitas) as visitas
            from visitas group by 1) x
    ),
    -- Aparelho que não gerou uma visita sequer no período. Pode ser ponto ruim,
    -- pode ser aparelho quebrado, e nos dois casos alguém precisa saber.
    'aparelhos_sem_visita', (
      select coalesce(jsonb_agg(x order by x.aparelho), '[]'::jsonb)
      from (
        select d.name as aparelho, d.code as codigo,
               coalesce(s.name, 'sem loja') as loja
        from public.devices d
        left join public.stores s on s.id = d.store_id
        where not d.exclude_from_reports
          and not exists (
            select 1 from public.device_events e
            where e.device_id = d.id and e.kind = 'app_usage'
              and e.started_at >= v_desde
          )
      ) x
    )
  ) into v_out;

  return v_out;
end;
$fn$;

comment on function public.fleet_report is 'Relatório agregado da frota por período. Lê as mesmas views do BI, para a tela e a planilha nunca discordarem.';


-- Complemento aplicado depois do primeiro relatório real (ver 20260728130000).
