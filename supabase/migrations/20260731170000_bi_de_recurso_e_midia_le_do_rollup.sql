-- LINKA - as duas ultimas views de BI param de ler device_events cru.
--
-- PARIDADE PROVADA ANTES DE TROCAR, nos dois sentidos e linha a linha:
--   recurso:  24 linhas na view crua, 24 no rollup, 0 divergencias
--   midia:   151 linhas na view crua, 151 no rollup, 0 divergencias
--            (271.080 segundos no ar dos dois lados)
-- E depois de trocar, view nova contra rollup: 0 e 0. A cadeia fecha
-- (crua = rollup = nova), que e o que autoriza a troca.
--
-- A primeira rodada acusou UMA linha diferente, na hora corrente: 720s na view
-- contra 540s no rollup. Nao era defeito - eram 180 segundos de video que
-- entraram entre preencher e comparar. Refeito o dia, zerou. Fica registrado
-- porque e a natureza do rollup: a hora corrente atrasa ate o cron passar (todo
-- minuto 7), e isso ja valia para visitas e vitrine desde a 20260730020000.
--
-- GANHO MEDIDO com EXPLAIN ANALYZE, na mesma massa de dados:
--   v_bi_media_hourly        74,8 ms -> 1,0 ms   (buffers 337 -> 29)
--   v_bi_interaction_hourly              0,7 ms
--   fleet_report(7) inteiro             56,0 ms
--
-- O numero de hoje importa menos que a FORMA do plano. Antes:
--   Nested Loop (rows=831168) e Rows Removed by Join Filter: 13.955
-- ou seja, custo proporcional ao produto entre trechos de video e visitas -
-- crescendo com o historico, para sempre. Agora e uma varredura de 151 linhas
-- ligada a 7 aparelhos: custo proporcional ao RESULTADO. Era isso que precisava
-- mudar; os milissegundos sao consequencia.
--
-- TIPOS PRESERVADOS de proposito: sum() sobre bigint devolve numeric, e a view
-- antiga devolvia bigint. Sem os casts explicitos, quem espera inteiro passaria
-- a receber decimal - mudanca que ninguem ve ate quebrar numa tela.

create or replace view public.v_bi_interaction_hourly as
select
  r.tenant_id,
  ch.name as rede,
  s.name as loja,
  s.city as cidade,
  s.state as uf,
  case s.kind
    when 'shopping'::store_kind then 'Shopping'
    when 'street'::store_kind then 'Rua'
    else 'Outro'
  end as tipo_local,
  d.code as codigo,
  d.name as aparelho,
  m.name as modelo,
  m.line as linha,
  r.hora_local,
  r.recurso,
  r.categoria,
  sum(r.sessoes)::bigint as sessoes,
  sum(r.segundos)::bigint as segundos
from public.rollup_recurso_hora r
join public.devices d on d.id = r.device_id
left join public.device_models m on m.id = d.model_id
left join public.stores s on s.id = d.store_id
left join public.retail_chains ch on ch.id = s.chain_id
group by r.tenant_id, ch.name, s.name, s.city, s.state, s.kind,
         d.code, d.name, m.name, m.line, r.hora_local, r.recurso, r.categoria;

-- `create or replace view` NAO preserva security_invoker. Sem esta linha a view
-- passa por cima do RLS e entrega dado de um cliente para outro (ja aconteceu
-- aqui - migration 20260730040000).
alter view public.v_bi_interaction_hourly set (security_invoker = on);

create or replace view public.v_bi_media_hourly as
select
  r.tenant_id,
  ch.name as rede,
  s.name as loja,
  s.city as cidade,
  s.state as uf,
  case s.kind
    when 'shopping'::store_kind then 'Shopping'
    when 'street'::store_kind then 'Rua'
    else 'Outro'
  end as tipo_local,
  d.code as codigo,
  d.name as aparelho,
  mo.name as modelo,
  mo.line as linha,
  r.hora_local,
  r.midia,
  sum(r.segundos_no_ar)::bigint as segundos_no_ar,
  sum(r.visitas)::bigint as visitas,
  sum(r.segundos_uso)::numeric as segundos_uso
from public.rollup_midia_hora r
join public.devices d on d.id = r.device_id
left join public.device_models mo on mo.id = d.model_id
left join public.stores s on s.id = d.store_id
left join public.retail_chains ch on ch.id = s.chain_id
group by r.tenant_id, ch.name, s.name, s.city, s.state, s.kind,
         d.code, d.name, mo.name, mo.line, r.hora_local, r.midia;

alter view public.v_bi_media_hourly set (security_invoker = on);
