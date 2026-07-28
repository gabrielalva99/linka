-- LINKA — o relatório passa a responder pergunta de VENDA, e não de operação.
--
-- Até aqui ele respondia "a frota está viva e o cliente mexeu?". Útil para
-- operar, inútil para decidir sortimento, promoção ou peça de campanha. As
-- perguntas que a marca faz de verdade são outras quatro, e nenhuma tinha
-- resposta:
--
--   qual MODELO segura mais o cliente
--   qual RECURSO ele procura em CADA modelo
--   que REGIÃO se comporta diferente
--   qual VÍDEO estava na tela quando ele parou
--
-- As três primeiras já estavam no dado e só não eram cruzadas. A quarta só
-- existe a partir de agora (ver 20260728180000).
--
-- Nenhuma taxa é calculada aqui de propósito. Dividir antes de agregar dá média
-- de médias — e "taxa de parada" errada é pior que taxa nenhuma, porque parece
-- certa. Quem divide é a tela, depois de somar.
create or replace function public.fleet_report(
  p_days int default 7, p_rede text default null,
  p_loja text default null, p_aparelho text default null
) returns jsonb language plpgsql stable set search_path = public as $fn$
declare v_desde timestamptz; v_out jsonb;
begin
  v_desde := date_trunc('day', now()) - make_interval(days => greatest(1, p_days) - 1);
  with visitas as (
    select * from public.v_bi_visits_hourly where hora_local >= v_desde
      and (p_rede is null or rede = p_rede) and (p_loja is null or loja = p_loja)
      and (p_aparelho is null or codigo = p_aparelho)),
  uso as (
    select * from public.v_bi_interaction_hourly where hora_local >= v_desde
      and (p_rede is null or rede = p_rede) and (p_loja is null or loja = p_loja)
      and (p_aparelho is null or codigo = p_aparelho)),
  vitrine as (
    select * from public.v_bi_showcase_hourly where hora_local >= v_desde
      and (p_rede is null or rede = p_rede) and (p_loja is null or loja = p_loja)
      and (p_aparelho is null or codigo = p_aparelho)),
  conteudo as (
    select * from public.v_bi_media_hourly where hora_local >= v_desde
      and (p_rede is null or rede = p_rede) and (p_loja is null or loja = p_loja)
      and (p_aparelho is null or codigo = p_aparelho)),
  vitrine_loja as (
    select coalesce(loja,'sem loja') as loja, sum(segundos_vitrine) as segundos
    from vitrine group by 1),
  -- Exposição por modelo: é o denominador que impede de confundir "engaja mais"
  -- com "tem mais aparelhos na rua".
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
           bool_and(d.block_settings and coalesce(d.blocked_apps,'') like '%settings%') as corrigido
    from public.device_events e
    join public.devices d on d.id = e.device_id
    left join public.stores s on s.id = d.store_id
    left join public.retail_chains ch on ch.id = s.chain_id
    where e.kind='app_usage' and e.package in ('com.android.settings','com.android.vending')
      and e.started_at >= v_desde and not d.exclude_from_reports
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
    'por_loja', (select coalesce(jsonb_agg(x order by x.visitas desc),'[]'::jsonb)
      from (select l.loja,l.rede,l.visitas,l.segundos, coalesce(vl.segundos,0) as segundos_vitrine
            from loja l left join vitrine_loja vl on vl.loja=l.loja) x),
    'por_rede', (select coalesce(jsonb_agg(x order by x.visitas desc),'[]'::jsonb)
      from (select rede, sum(visitas) as visitas, sum(segundos) as segundos from loja group by 1) x),
    'por_aparelho', (select coalesce(jsonb_agg(x order by x.visitas desc),'[]'::jsonb) from aparelho x),
    'por_recurso', (select coalesce(jsonb_agg(x order by x.segundos desc),'[]'::jsonb)
      from (select recurso, categoria, sum(sessoes) as sessoes, sum(segundos) as segundos
            from uso group by 1,2) x),
    -- Qual modelo segura mais o cliente, com a exposição ao lado.
    'por_modelo', (select coalesce(jsonb_agg(x order by x.visitas desc),'[]'::jsonb)
      from (select coalesce(v.modelo,'sem modelo') as modelo,
                   coalesce(v.linha,'—') as linha,
                   sum(v.visitas) as visitas, sum(v.segundos_uso) as segundos,
                   coalesce(max(vm.segundos),0) as segundos_vitrine
            from visitas v
            left join vitrine_modelo vm on vm.modelo = coalesce(v.modelo,'sem modelo')
            group by 1,2) x),
    -- O que o cliente procura EM CADA modelo. É o cruzamento que vira argumento
    -- de vitrine: se no dobrável ele abre câmera e no de entrada abre jogo, a
    -- peça de cada um não deveria ser a mesma.
    'por_recurso_modelo', (select coalesce(jsonb_agg(x order by x.segundos desc),'[]'::jsonb)
      from (select coalesce(modelo,'sem modelo') as modelo, recurso,
                   sum(sessoes) as sessoes, sum(segundos) as segundos
            from uso group by 1,2) x),
    -- Recorte geográfico: mesma linha de produto se comporta diferente por praça.
    'por_regiao', (select coalesce(jsonb_agg(x order by x.visitas desc),'[]'::jsonb)
      from (select coalesce(uf,'—') as uf, coalesce(cidade,'—') as cidade,
                   coalesce(tipo_local,'Outro') as tipo_local,
                   coalesce(linha,'—') as linha,
                   sum(visitas) as visitas, sum(segundos_uso) as segundos
            from visitas group by 1,2,3,4) x),
    -- Desempenho de cada vídeo: tempo no ar e quantas pessoas pararam com ele
    -- na tela.
    'por_conteudo', (select coalesce(jsonb_agg(x order by x.visitas desc, x.segundos_no_ar desc),'[]'::jsonb)
      from (select midia, sum(segundos_no_ar) as segundos_no_ar,
                   sum(visitas) as visitas, sum(segundos_uso) as segundos_uso
            from conteudo group by 1) x),
    'por_dia', (select coalesce(jsonb_agg(x order by x.dia),'[]'::jsonb)
      from (select hora_local::date as dia, sum(visitas) as visitas, sum(segundos_uso) as segundos
            from visitas group by 1) x),
    'por_hora', (select coalesce(jsonb_agg(x order by x.hora),'[]'::jsonb)
      from (select extract(hour from hora_local)::int as hora, sum(visitas) as visitas
            from visitas group by 1) x),
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
                where e.device_id = d.id and e.kind='app_usage' and e.started_at >= v_desde)) x)
  ) into v_out;
  return v_out;
end; $fn$;
