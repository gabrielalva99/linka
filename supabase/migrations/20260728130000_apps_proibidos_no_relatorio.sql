-- "Ajustes" apareceu como o recurso MAIS usado da frota no primeiro relatório
-- real. Isso não é estatística, é alarme: Ajustes e Play Store são bloqueados
-- justamente porque é por ali que se cria senha de tela e se instala qualquer
-- coisa num aparelho de vitrine. Se aparecem, ou o bloqueio não estava valendo
-- naquele aparelho, ou alguém tirou.
--
-- Enterrado numa barra de gráfico, isso passa despercebido. Sai da lista de
-- recursos e vira aviso separado, com aparelho e loja, que é o que alguém
-- precisa para ir atrás.
--
-- O alarme lê o EVENTO CRU de propósito: os dois pacotes passam a ser ruído
-- para o relatório (abaixo), e é justamente por isso que ele não pode depender
-- das mesmas views.
update public.app_catalog set is_noise = true
where package in ('com.android.settings', 'com.android.vending');

-- Pacotes de encanamento que apareceram no primeiro relatório. Os dois
-- primeiros TÊM ícone, então a regra do inventário não os pega: nome de negócio
-- e marca de ruído explícita.
insert into public.app_catalog (package, label, category, is_noise) values
  ('com.motorola.motomigrate',          'Migrar dados',          'system', true),
  ('com.motorola.uxcore',               'Interno Motorola',      'system', true),
  ('com.android.settings.intelligence', 'Busca nos Ajustes',     'system', true),
  ('com.motorola.ccc.ota',              'Atualização do Android','system', true),
  ('com.google.android.gms',            'Serviços Google',       'system', true)
on conflict (package) do update
  set label = excluded.label,
      category = excluded.category,
      is_noise = excluded.is_noise;

create or replace function public.fleet_report(p_days int default 7)
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
  proibidos as (
    select coalesce(s.name, 'sem loja') as loja, d.name as aparelho, d.code as codigo,
           case e.package when 'com.android.settings' then 'Ajustes'
                          when 'com.android.vending'  then 'Play Store' end as app,
           count(*) as vezes
    from public.device_events e
    join public.devices d on d.id = e.device_id
    left join public.stores s on s.id = d.store_id
    where e.kind = 'app_usage'
      and e.package in ('com.android.settings', 'com.android.vending')
      and e.started_at >= v_desde
      and not d.exclude_from_reports
    group by 1, 2, 3, 4
  )
  select jsonb_build_object(
    'dias', greatest(1, p_days),
    'visitas', (select coalesce(sum(visitas), 0) from visitas),
    'segundos_uso', (select coalesce(sum(segundos_uso), 0) from visitas),
    'segundos_vitrine', (select coalesce(sum(segundos_vitrine), 0) from vitrine),
    'lojas_com_dado', (select count(*) from loja),
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
