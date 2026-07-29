-- LINKA - aparelho arquivado para de aparecer no que e "agora".
--
-- A regra, que faltava estar escrita em algum lugar:
--
--   HISTORICO conta arquivado. Visita que aconteceu em marco aconteceu, e o
--   relatorio de marco tem que continuar batendo depois que o aparelho sai de
--   linha. Por isso o calculo de uso (que le device_events) NAO filtra.
--
--   "AGORA" nao conta arquivado. Quantos aparelhos existem, quais estao fora do
--   ar, quais nao tiveram visita: sao listas de ACAO. Ninguem vai a loja checar
--   um aparelho que nao esta mais la.
--
-- Dois numeros estavam do lado errado dessa linha:
--
--   aparelhos_fora       - somava aparelho de teste ja arquivado.
--   aparelhos_sem_visita - listava arquivado como pendencia para sempre. Este e
--                          o pior: manda alguem procurar na loja um aparelho
--                          que nao esta mais la.
--
-- O bloco 'frota' ja filtrava (migration 20260729000000). Aqui o resto alinha.

create or replace function public.fleet_report(
  p_days int default 7, p_rede text default null,
  p_loja text default null, p_aparelho text default null,
  p_tenant uuid default null
) returns jsonb language plpgsql stable set search_path = public as $fn$
declare
  v_ini     timestamp;
  v_ini_ant timestamp;
  v_ini_tz  timestamptz;
  v_hoje    date;
  v_out     jsonb;
begin
  v_ini := date_trunc('day', now() at time zone 'America/Sao_Paulo')
           - make_interval(days => greatest(1, p_days) - 1);
  v_ini_ant := v_ini - make_interval(days => greatest(1, p_days));
  v_ini_tz := v_ini at time zone 'America/Sao_Paulo';
  v_hoje := (now() at time zone 'America/Sao_Paulo')::date;

  with visitas as (
    select * from public.v_bi_visits_hourly where hora_local >= v_ini
      and (p_rede is null or rede = p_rede) and (p_loja is null or loja = p_loja)
      and (p_aparelho is null or codigo = p_aparelho)
      and (p_tenant is null or tenant_id = p_tenant)),
  uso as (
    select * from public.v_bi_interaction_hourly where hora_local >= v_ini
      and (p_rede is null or rede = p_rede) and (p_loja is null or loja = p_loja)
      and (p_aparelho is null or codigo = p_aparelho)
      and (p_tenant is null or tenant_id = p_tenant)),
  vitrine as (
    select * from public.v_bi_showcase_hourly where hora_local >= v_ini
      and (p_rede is null or rede = p_rede) and (p_loja is null or loja = p_loja)
      and (p_aparelho is null or codigo = p_aparelho)
      and (p_tenant is null or tenant_id = p_tenant)),
  conteudo as (
    select * from public.v_bi_media_hourly where hora_local >= v_ini
      and (p_rede is null or rede = p_rede) and (p_loja is null or loja = p_loja)
      and (p_aparelho is null or codigo = p_aparelho)
      and (p_tenant is null or tenant_id = p_tenant)),
  visitas_ant as (
    select * from public.v_bi_visits_hourly
      where hora_local >= v_ini_ant and hora_local < v_ini
      and (p_rede is null or rede = p_rede) and (p_loja is null or loja = p_loja)
      and (p_aparelho is null or codigo = p_aparelho)
      and (p_tenant is null or tenant_id = p_tenant)),
  vitrine_ant as (
    select * from public.v_bi_showcase_hourly
      where hora_local >= v_ini_ant and hora_local < v_ini
      and (p_rede is null or rede = p_rede) and (p_loja is null or loja = p_loja)
      and (p_aparelho is null or codigo = p_aparelho)
      and (p_tenant is null or tenant_id = p_tenant)),
  frota as (
    select d.id, d.store_id,
           coalesce(m.name, 'sem modelo') as modelo,
           coalesce(m.line, '—')          as linha
    from public.devices d
    left join public.device_models m on m.id = d.model_id
    left join public.stores s on s.id = d.store_id
    left join public.retail_chains ch on ch.id = s.chain_id
    where not d.exclude_from_reports and d.is_active
      and (p_tenant is null or d.tenant_id = p_tenant)
      and (p_rede is null or ch.name = p_rede)
      and (p_loja is null or s.name = p_loja)
      and (p_aparelho is null or d.code = p_aparelho)),
  capilaridade as (
    select modelo, min(linha) as linha,
           count(*) as unidades,
           count(distinct store_id) as lojas
    from frota group by 1),
  lojas_total as (
    select count(*) as n from public.stores s
    left join public.retail_chains ch on ch.id = s.chain_id
    where s.is_active
      and (p_tenant is null or s.tenant_id = p_tenant)
      and (p_rede is null or ch.name = p_rede)
      and (p_loja is null or s.name = p_loja)),
  cobertura as (
    select linha, count(distinct store_id) as lojas_com
    from frota where store_id is not null group by 1),
  vitrine_loja as (
    select coalesce(loja,'sem loja') as loja, sum(segundos_vitrine) as segundos
    from vitrine group by 1),
  vitrine_modelo as (
    select coalesce(modelo,'sem modelo') as modelo, sum(segundos_vitrine) as segundos
    from vitrine group by 1),
  visitas_modelo as (
    select coalesce(modelo,'sem modelo') as modelo,
           sum(visitas) as visitas, sum(segundos_uso) as segundos
    from visitas group by 1),
  dias_modelo as (
    select coalesce(modelo,'sem modelo') as modelo,
           hora_local::date as dia, sum(visitas) as visitas
    from visitas group by 1,2),
  ultimo as (
    select modelo, max(dia) as dia from dias_modelo
    where dia < v_hoje group by 1),
  perf as (
    select d.modelo,
           to_char(u.dia, 'DD/MM')                          as ultimo_dia_data,
           max(case when d.dia = u.dia then d.visitas end)   as ultimo_dia,
           avg(case when d.dia <> u.dia then d.visitas end)  as media_dia,
           count(*) filter (where d.dia <> u.dia)            as dias_base
    from dias_modelo d join ultimo u on u.modelo = d.modelo
    where d.dia < v_hoje
    group by 1, 2),
  loja as (
    select coalesce(v.loja,'sem loja') as loja, coalesce(v.rede,'sem rede') as rede,
           sum(v.visitas) as visitas, sum(v.segundos_uso) as segundos
    from visitas v group by 1,2),
  aparelho as (
    select coalesce(v.codigo,'') as codigo, v.aparelho, coalesce(v.loja,'sem loja') as loja,
           sum(v.visitas) as visitas, sum(v.segundos_uso) as segundos
    from visitas v group by 1,2,3),
  proibidos as (
    select coalesce(s.name,'sem loja') as loja, d.name as aparelho, d.code as codigo,
           case e.package when 'com.android.settings' then 'Ajustes'
                          when 'com.android.vending' then 'Play Store' end as app,
           count(*) as vezes,
           to_char(max(e.started_at at time zone coalesce(s.timezone,'America/Sao_Paulo')),
                   'DD/MM HH24:MI') as ultima_vez,
           to_char(max(e.started_at at time zone coalesce(s.timezone,'America/Sao_Paulo'))
                   + make_interval(days => greatest(1, p_days)), 'DD/MM') as sai_em,
           bool_and(d.block_settings and coalesce(d.blocked_apps,'') like '%settings%') as corrigido
    from public.device_events e
    join public.devices d on d.id = e.device_id
    left join public.stores s on s.id = d.store_id
    left join public.retail_chains ch on ch.id = s.chain_id
    where e.kind='app_usage' and e.package in ('com.android.settings','com.android.vending')
      and e.started_at >= v_ini_tz and not d.exclude_from_reports
      and (p_tenant is null or d.tenant_id = p_tenant)
      and (p_rede is null or ch.name = p_rede) and (p_loja is null or s.name = p_loja)
      and (p_aparelho is null or d.code = p_aparelho)
    group by 1,2,3,4)
  select jsonb_build_object(
    'dias', greatest(1,p_days), 'filtro_rede', p_rede, 'filtro_loja', p_loja,
    'filtro_aparelho', p_aparelho,
    'visitas', (select coalesce(sum(visitas),0) from visitas),
    'segundos_uso', (select coalesce(sum(segundos_uso),0) from visitas),
    'segundos_vitrine', (select coalesce(sum(segundos_vitrine),0) from vitrine),
    'lojas_com_dado', (select count(*) from loja),
    'aparelhos_fora', (select count(*) from public.devices
      where exclude_from_reports and is_active
        and (p_tenant is null or tenant_id = p_tenant)),
    'anterior', jsonb_build_object(
      'visitas', (select coalesce(sum(visitas),0) from visitas_ant),
      'segundos_uso', (select coalesce(sum(segundos_uso),0) from visitas_ant),
      'segundos_vitrine', (select coalesce(sum(segundos_vitrine),0) from vitrine_ant),
      'tem_base', (select count(*) > 0 from visitas_ant)
    ),
    'frota', jsonb_build_object(
      'aparelhos', (select count(*) from frota),
      'lojas_com_aparelho', (select count(distinct store_id) from frota where store_id is not null),
      'lojas_total', (select n from lojas_total),
      'modelos', (select count(*) from capilaridade),
      'sem_loja', (select count(*) from frota where store_id is null)
    ),
    'capilaridade', (select coalesce(jsonb_agg(x order by x.lojas desc, x.unidades desc),'[]'::jsonb)
      from (select modelo, linha, unidades, lojas from capilaridade) x),
    'cobertura', (select coalesce(jsonb_agg(x order by x.lojas_com desc),'[]'::jsonb)
      from (select c.linha, c.lojas_com, (select n from lojas_total) as lojas_total
            from cobertura c) x),
    'por_loja', (select coalesce(jsonb_agg(x order by x.visitas desc),'[]'::jsonb)
      from (select l.loja,l.rede,l.visitas,l.segundos, coalesce(vl.segundos,0) as segundos_vitrine
            from loja l left join vitrine_loja vl on vl.loja=l.loja) x),
    'por_rede', (select coalesce(jsonb_agg(x order by x.visitas desc),'[]'::jsonb)
      from (select rede, sum(visitas) as visitas, sum(segundos) as segundos from loja group by 1) x),
    'por_aparelho', (select coalesce(jsonb_agg(x order by x.visitas desc),'[]'::jsonb) from aparelho x),
    'por_recurso', (select coalesce(jsonb_agg(x order by x.segundos desc),'[]'::jsonb)
      from (select recurso, categoria, sum(sessoes) as sessoes, sum(segundos) as segundos
            from uso group by 1,2) x),
    'por_modelo', (select coalesce(jsonb_agg(x order by x.visitas desc),'[]'::jsonb)
      from (select c.modelo, c.linha, c.unidades, c.lojas,
                   coalesce(vm2.visitas,0)  as visitas,
                   coalesce(vm2.segundos,0) as segundos,
                   coalesce(vt.segundos,0)  as segundos_vitrine,
                   p.ultimo_dia, p.ultimo_dia_data,
                   round(p.media_dia, 1) as media_dia,
                   coalesce(p.dias_base, 0) as dias_base
            from capilaridade c
            left join visitas_modelo vm2 on vm2.modelo = c.modelo
            left join vitrine_modelo vt on vt.modelo = c.modelo
            left join perf p on p.modelo = c.modelo) x),
    'por_recurso_modelo', (select coalesce(jsonb_agg(x order by x.segundos desc),'[]'::jsonb)
      from (select coalesce(modelo,'sem modelo') as modelo, recurso,
                   sum(sessoes) as sessoes, sum(segundos) as segundos
            from uso group by 1,2) x),
    'por_regiao', (select coalesce(jsonb_agg(x order by x.visitas desc),'[]'::jsonb)
      from (select coalesce(uf,'—') as uf, coalesce(cidade,'—') as cidade,
                   coalesce(tipo_local,'Outro') as tipo_local,
                   coalesce(linha,'—') as linha,
                   sum(visitas) as visitas, sum(segundos_uso) as segundos
            from visitas group by 1,2,3,4) x),
    'por_conteudo', (select coalesce(jsonb_agg(x order by x.visitas desc, x.segundos_no_ar desc),'[]'::jsonb)
      from (select midia, sum(segundos_no_ar) as segundos_no_ar,
                   sum(visitas) as visitas, sum(segundos_uso) as segundos_uso
            from conteudo group by 1) x),
    'por_dia', (select coalesce(jsonb_agg(x order by x.dia),'[]'::jsonb)
      from (select hora_local::date as dia, sum(visitas) as visitas, sum(segundos_uso) as segundos
            from visitas group by 1) x),
    'por_dia_semana', (select coalesce(jsonb_agg(x order by x.dia),'[]'::jsonb)
      from (select extract(isodow from hora_local)::int as dia,
                   sum(visitas) as visitas, sum(segundos_uso) as segundos,
                   count(distinct hora_local::date) as dias
            from visitas group by 1) x),
    'por_hora', (select coalesce(jsonb_agg(x order by x.hora),'[]'::jsonb)
      from (select extract(hour from hora_local)::int as hora, sum(visitas) as visitas
            from visitas group by 1) x),
    'perfil_hora', (select coalesce(jsonb_agg(x order by x.linha, x.hora),'[]'::jsonb)
      from (select coalesce(linha,'—') as linha,
                   extract(hour from hora_local)::int as hora,
                   sum(visitas) as visitas
            from visitas group by 1,2) x),
    'mapa', (select coalesce(jsonb_agg(x order by x.dia, x.hora),'[]'::jsonb)
      from (select extract(isodow from hora_local)::int as dia,
                   extract(hour from hora_local)::int as hora,
                   sum(visitas) as visitas
            from visitas group by 1,2) x),
    'por_canal_hora', (select coalesce(jsonb_agg(x order by x.hora),'[]'::jsonb)
      from (select coalesce(tipo_local,'Outro') as tipo_local,
                   extract(hour from hora_local)::int as hora,
                   sum(visitas) as visitas
            from visitas group by 1,2) x),
    'proibidos_abertos', (select coalesce(jsonb_agg(x order by x.vezes desc),'[]'::jsonb)
      from proibidos x where not x.corrigido),
    'proibidos_corrigidos', (select coalesce(jsonb_agg(x order by x.vezes desc),'[]'::jsonb)
      from proibidos x where x.corrigido),
    'aparelhos_sem_visita', (select coalesce(jsonb_agg(x order by x.aparelho),'[]'::jsonb)
      from (select d.name as aparelho, d.code as codigo, coalesce(s.name,'sem loja') as loja
            from public.devices d
            left join public.stores s on s.id = d.store_id
            left join public.retail_chains ch on ch.id = s.chain_id
            where not d.exclude_from_reports and d.is_active
              and (p_tenant is null or d.tenant_id = p_tenant)
              and (p_rede is null or ch.name = p_rede) and (p_loja is null or s.name = p_loja)
              and (p_aparelho is null or d.code = p_aparelho)
              and not exists (select 1 from public.device_events e
                where e.device_id = d.id and e.kind='app_usage' and e.started_at >= v_ini_tz)) x)
  ) into v_out;
  return v_out;
end; $fn$;
