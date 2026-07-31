-- LINKA — o aviso de "app proibido aberto" para de gritar sem motivo.
--
-- O SINTOMA. O painel mostrava "Aparelho com Ajustes ou Play Store liberados
-- agora" para os dois aparelhos, com data de 29/07, sem parar. Medido no aparelho
-- antes de mexer em qualquer coisa:
--
--   com.android.vending   hidden=true    <- Play Store bloqueada
--   com.android.settings  hidden=false   <- alcancavel, DE PROPOSITO
--   no_config_credentials ATIVA          <- ninguem cria senha de tela
--   no_safe_boot          ATIVA
--   no_factory_reset      ATIVA
--
-- Ou seja: o aparelho estava protegido. O aviso e que estava errado.
--
-- A CAUSA. A condicao de "corrigido" exigia que o aparelho reportasse ter
-- escondido `settings`. O agente parou de esconder Ajustes ha versoes, porque
-- esconde-lo foi o que impediu dois aparelhos de ligar — a protecao passou a ser
-- a restricao de credenciais. A regra do relatorio nao acompanhou: ficou pedindo
-- uma prova que o produto nao produz mais.
--
-- E o mesmo defeito de sempre, em roupa nova: a mesma decisao escrita em dois
-- lugares (o agente e o relatorio), e um deles mudou sozinho.
--
-- Nao muda nada no aparelho, nao exige APK, e o evento continua sendo registrado:
-- saber que alguem entrou em Ajustes numa loja continua valendo. O que muda e
-- quando o aviso se considera resolvido.

create or replace function public.fleet_report(
  p_days int default 7, p_rede text default null,
  p_loja text default null, p_aparelho text default null
) returns jsonb language plpgsql stable set search_path = public as $fn$
declare
  v_ini     timestamp;    -- início da janela, em hora de loja
  v_ini_ant timestamp;    -- início da janela anterior, do mesmo tamanho
  v_ini_tz  timestamptz;  -- a mesma fronteira, para comparar com evento cru
  v_out     jsonb;
begin
  v_ini := date_trunc('day', now() at time zone 'America/Sao_Paulo')
           - make_interval(days => greatest(1, p_days) - 1);
  v_ini_ant := v_ini - make_interval(days => greatest(1, p_days));
  v_ini_tz := v_ini at time zone 'America/Sao_Paulo';

  with visitas as (
    select * from public.v_bi_visits_hourly where hora_local >= v_ini
      and (p_rede is null or rede = p_rede) and (p_loja is null or loja = p_loja)
      and (p_aparelho is null or codigo = p_aparelho)),
  uso as (
    select * from public.v_bi_interaction_hourly where hora_local >= v_ini
      and (p_rede is null or rede = p_rede) and (p_loja is null or loja = p_loja)
      and (p_aparelho is null or codigo = p_aparelho)),
  vitrine as (
    select * from public.v_bi_showcase_hourly where hora_local >= v_ini
      and (p_rede is null or rede = p_rede) and (p_loja is null or loja = p_loja)
      and (p_aparelho is null or codigo = p_aparelho)),
  conteudo as (
    select * from public.v_bi_media_hourly where hora_local >= v_ini
      and (p_rede is null or rede = p_rede) and (p_loja is null or loja = p_loja)
      and (p_aparelho is null or codigo = p_aparelho)),
  -- Mesmo recorte, janela imediatamente anterior. Serve só para a comparação.
  visitas_ant as (
    select * from public.v_bi_visits_hourly
      where hora_local >= v_ini_ant and hora_local < v_ini
      and (p_rede is null or rede = p_rede) and (p_loja is null or loja = p_loja)
      and (p_aparelho is null or codigo = p_aparelho)),
  vitrine_ant as (
    select * from public.v_bi_showcase_hourly
      where hora_local >= v_ini_ant and hora_local < v_ini
      and (p_rede is null or rede = p_rede) and (p_loja is null or loja = p_loja)
      and (p_aparelho is null or codigo = p_aparelho)),
  vitrine_loja as (
    select coalesce(loja,'sem loja') as loja, sum(segundos_vitrine) as segundos
    from vitrine group by 1),
  vitrine_modelo as (
    select coalesce(modelo,'sem modelo') as modelo, sum(segundos_vitrine) as segundos
    from vitrine group by 1),
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
           -- CORRIGIDO = a protecao que o produto realmente aplica hoje.
           --
           -- Aqui exigia-se que o aparelho reportasse ter ESCONDIDO o app de
           -- Ajustes. So que o agente parou de esconder Ajustes de proposito: foi
           -- exatamente isso que inutilizou dois aparelhos, e a protecao mudou de
           -- lugar (a restricao no_config_credentials, que impede criar senha de
           -- tela — o risco real de virar tijolo). A condicao virou impossivel de
           -- satisfazer, e o aviso ficou aceso por dias sem nada de errado.
           --
           -- Aviso que grita sem motivo por dois dias ensina a ignorar aviso, e ai
           -- ele deixa de servir para o dia em que houver algo de verdade.
           bool_and(d.block_settings and coalesce(d.blocked_apps,'') like '%vending%') as corrigido
    from public.device_events e
    join public.devices d on d.id = e.device_id
    left join public.stores s on s.id = d.store_id
    left join public.retail_chains ch on ch.id = s.chain_id
    where e.kind='app_usage' and e.package in ('com.android.settings','com.android.vending')
      and e.started_at >= v_ini_tz and not d.exclude_from_reports
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
    'aparelhos_fora', (select count(*) from public.devices where exclude_from_reports),
    -- Número sozinho não se julga: "412 visitas" só quer dizer algo ao lado das
    -- 380 da semana passada. Vem cru, sem calcular a variação: quem divide é a
    -- tela, que sabe distinguir "caiu 8%" de "não havia base para comparar".
    'anterior', jsonb_build_object(
      'visitas', (select coalesce(sum(visitas),0) from visitas_ant),
      'segundos_uso', (select coalesce(sum(segundos_uso),0) from visitas_ant),
      'segundos_vitrine', (select coalesce(sum(segundos_vitrine),0) from vitrine_ant),
      'tem_base', (select count(*) > 0 from visitas_ant)
    ),
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
      from (select coalesce(v.modelo,'sem modelo') as modelo,
                   coalesce(v.linha,'—') as linha,
                   sum(v.visitas) as visitas, sum(v.segundos_uso) as segundos,
                   coalesce(max(vm.segundos),0) as segundos_vitrine
            from visitas v
            left join vitrine_modelo vm on vm.modelo = coalesce(v.modelo,'sem modelo')
            group by 1,2) x),
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
    -- Dia da semana com a contagem de dias ao lado: sem ela, um período de 10
    -- dias tem dois sábados e um domingo, e o sábado "ganha" por calendário.
    'por_dia_semana', (select coalesce(jsonb_agg(x order by x.dia),'[]'::jsonb)
      from (select extract(isodow from hora_local)::int as dia,
                   sum(visitas) as visitas, sum(segundos_uso) as segundos,
                   count(distinct hora_local::date) as dias
            from visitas group by 1) x),
    'por_hora', (select coalesce(jsonb_agg(x order by x.hora),'[]'::jsonb)
      from (select extract(hour from hora_local)::int as hora, sum(visitas) as visitas
            from visitas group by 1) x),
    -- Concentração dia × hora. É o que separa "movimento de sábado" de
    -- "movimento de sábado à tarde", que é onde se decide escala de promotor.
    'mapa', (select coalesce(jsonb_agg(x order by x.dia, x.hora),'[]'::jsonb)
      from (select extract(isodow from hora_local)::int as dia,
                   extract(hour from hora_local)::int as hora,
                   sum(visitas) as visitas
            from visitas group by 1,2) x),
    -- Rua e shopping têm curvas diferentes; somadas, viram uma curva que não
    -- descreve nenhum dos dois.
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
            where not d.exclude_from_reports
              and (p_rede is null or ch.name = p_rede) and (p_loja is null or s.name = p_loja)
              and (p_aparelho is null or d.code = p_aparelho)
              and not exists (select 1 from public.device_events e
                where e.device_id = d.id and e.kind='app_usage' and e.started_at >= v_ini_tz)) x)
  ) into v_out;
  return v_out;
end; $fn$;
