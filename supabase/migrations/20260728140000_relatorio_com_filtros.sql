-- Duas coisas que a primeira leitura real do relatório expôs.
--
-- 1. Um aparelho sumiu do relatório sem explicação. Ele está marcado como
--    aparelho de teste, que é exatamente o que a marca faz, mas a tela não
--    dizia nada. Número que some sem explicação destrói a confiança no
--    relatório inteiro: agora a contagem de excluídos vem junto.
--
-- 2. Faltava navegar o dado. Frota inteira é a visão de abertura; a pergunta
--    seguinte é sempre "e nesta rede?", "e nesta loja?", "e neste aparelho?".
--    Os filtros são parâmetros da MESMA função, e não uma segunda consulta:
--    duas funções somando de jeitos diferentes é como o total deixa de bater
--    com a soma das partes.
--
-- A versão de um argumento SAI. Com as duas convivendo, a chamada com só o
-- período fica ambígua para o Postgres e o painel quebraria com um "não
-- consegui montar o relatório" que ninguém entenderia.
drop function if exists public.fleet_report(int);

create or replace function public.fleet_report(
  p_days int default 7,
  p_rede text default null,
  p_loja text default null,
  p_aparelho text default null
)
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
    select * from public.v_bi_visits_hourly
    where hora_local >= v_desde
      and (p_rede is null or rede = p_rede)
      and (p_loja is null or loja = p_loja)
      and (p_aparelho is null or codigo = p_aparelho)
  ),
  uso as (
    select * from public.v_bi_interaction_hourly
    where hora_local >= v_desde
      and (p_rede is null or rede = p_rede)
      and (p_loja is null or loja = p_loja)
      and (p_aparelho is null or codigo = p_aparelho)
  ),
  vitrine as (
    select * from public.v_bi_showcase_hourly
    where hora_local >= v_desde
      and (p_rede is null or rede = p_rede)
      and (p_loja is null or loja = p_loja)
      and (p_aparelho is null or codigo = p_aparelho)
  ),
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
  ),
  aparelho as (
    select coalesce(v.codigo, '') as codigo, v.aparelho,
           coalesce(v.loja, 'sem loja') as loja,
           sum(v.visitas) as visitas, sum(v.segundos_uso) as segundos
    from visitas v group by 1, 2, 3
  ),
  proibidos as (
    select coalesce(s.name, 'sem loja') as loja, d.name as aparelho, d.code as codigo,
           case e.package when 'com.android.settings' then 'Ajustes'
                          when 'com.android.vending'  then 'Play Store' end as app,
           count(*) as vezes
    from public.device_events e
    join public.devices d on d.id = e.device_id
    left join public.stores s on s.id = d.store_id
    left join public.retail_chains ch on ch.id = s.chain_id
    where e.kind = 'app_usage'
      and e.package in ('com.android.settings', 'com.android.vending')
      and e.started_at >= v_desde
      and not d.exclude_from_reports
      and (p_rede is null or ch.name = p_rede)
      and (p_loja is null or s.name = p_loja)
      and (p_aparelho is null or d.code = p_aparelho)
    group by 1, 2, 3, 4
  )
  select jsonb_build_object(
    'dias', greatest(1, p_days),
    'filtro_rede', p_rede,
    'filtro_loja', p_loja,
    'filtro_aparelho', p_aparelho,
    'visitas', (select coalesce(sum(visitas), 0) from visitas),
    'segundos_uso', (select coalesce(sum(segundos_uso), 0) from visitas),
    'segundos_vitrine', (select coalesce(sum(segundos_vitrine), 0) from vitrine),
    'lojas_com_dado', (select count(*) from loja),
    -- Aparelho de bancada sai dos relatórios, e a tela precisa DIZER isso.
    'aparelhos_fora', (select count(*) from public.devices where exclude_from_reports),
    'por_loja', (
      select coalesce(jsonb_agg(x order by x.visitas desc), '[]'::jsonb)
      from (select l.loja, l.rede, l.visitas, l.segundos,
                   coalesce(vl.segundos, 0) as segundos_vitrine
            from loja l left join vitrine_loja vl on vl.loja = l.loja) x
    ),
    'por_rede', (
      select coalesce(jsonb_agg(x order by x.visitas desc), '[]'::jsonb)
      from (select rede, sum(visitas) as visitas, sum(segundos) as segundos
            from loja group by 1) x
    ),
    'por_aparelho', (
      select coalesce(jsonb_agg(x order by x.visitas desc), '[]'::jsonb) from aparelho x
    ),
    'por_recurso', (
      select coalesce(jsonb_agg(x order by x.segundos desc), '[]'::jsonb)
      from (select recurso, categoria, sum(sessoes) as sessoes, sum(segundos) as segundos
            from uso group by 1, 2) x
    ),
    'por_dia', (
      select coalesce(jsonb_agg(x order by x.dia), '[]'::jsonb)
      from (select hora_local::date as dia, sum(visitas) as visitas,
                   sum(segundos_uso) as segundos from visitas group by 1) x
    ),
    'por_hora', (
      select coalesce(jsonb_agg(x order by x.hora), '[]'::jsonb)
      from (select extract(hour from hora_local)::int as hora, sum(visitas) as visitas
            from visitas group by 1) x
    ),
    'apps_proibidos', (
      select coalesce(jsonb_agg(x order by x.vezes desc), '[]'::jsonb) from proibidos x
    ),
    'aparelhos_sem_visita', (
      select coalesce(jsonb_agg(x order by x.aparelho), '[]'::jsonb)
      from (
        select d.name as aparelho, d.code as codigo,
               coalesce(s.name, 'sem loja') as loja
        from public.devices d
        left join public.stores s on s.id = d.store_id
        left join public.retail_chains ch on ch.id = s.chain_id
        where not d.exclude_from_reports
          and (p_rede is null or ch.name = p_rede)
          and (p_loja is null or s.name = p_loja)
          and (p_aparelho is null or d.code = p_aparelho)
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
