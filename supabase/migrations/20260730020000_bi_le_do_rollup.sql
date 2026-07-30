-- LINKA — o BI passa a ler do rollup. Com vigia, porque agora existe o que vigiar.
--
-- A PARIDADE JA FOI PROVADA (migration 20260730010000): visitas 26/26, uso 500/500,
-- vitrine 160.355/160.355, zero divergencia hora a hora. Sem essa prova esta
-- migration nao existiria — repontuar view de relatorio para uma fonte nova sem
-- comparar numero e trocar o velocimetro do carro em movimento.
--
-- O QUE MUDA. v_bi_visits_hourly e v_bi_showcase_hourly deixam de recalcular
-- ilhas de visita sobre device_events e passam a ler rollup_visita_hora. As
-- dimensoes (rede, loja, cidade, uf, tipo, codigo, aparelho, modelo, linha)
-- continuam vindo das tabelas de cadastro, por join — sao poucas linhas e mudam
-- pouco, e mante-las no cadastro e o que permite corrigir o nome de uma loja sem
-- reprocessar historico.
--
-- ── O RISCO NOVO, e por que o vigia vem junto ──────────────────────────────
-- Antes, a view lia o dado cru: existindo evento, existia numero. Agora ela le uma
-- TABELA PREENCHIDA — e tabela preenchida pode ficar com buraco: cron pausado,
-- migration que falhou no meio, dia que ninguem processou.
--
-- O modo de falha e o pior possivel: o relatorio mostraria ZERO com naturalidade,
-- sem erro nenhum. "A loja nao teve visita ontem" e uma frase perfeitamente normal
-- — ninguem desconfia dela. Foi exatamente esse tipo de mentira silenciosa que
-- esta varredura passou o dia caçando (o aparelho surdo com o painel verde, a
-- biblioteca dizendo "sem uso" sobre video no ar).
--
-- Entao a troca so entra acompanhada de v_rollup_pendente: dia que tem evento e
-- nao tem rollup aparece. Sem numero que ninguem consegue conferir.

-- ── O vigia ────────────────────────────────────────────────────────────────
create or replace view public.v_rollup_pendente
  with (security_invoker = on) as
with dias_com_evento as (
  select e.tenant_id,
         (e.started_at at time zone coalesce(s.timezone, 'America/Sao_Paulo'))::date as dia,
         count(*) as eventos
  from public.device_events e
  join public.devices d on d.id = e.device_id
  left join public.stores s on s.id = d.store_id
  where e.kind in ('app_usage','showcase') and not d.exclude_from_reports
  group by 1, 2
),
dias_no_rollup as (
  select tenant_id, hora_local::date as dia, count(*) as linhas
  from public.rollup_visita_hora
  group by 1, 2
)
select v.tenant_id, v.dia, v.eventos,
       coalesce(r.linhas, 0) as linhas_no_rollup
from dias_com_evento v
left join dias_no_rollup r on r.tenant_id = v.tenant_id and r.dia = v.dia
where coalesce(r.linhas, 0) = 0;

comment on view public.v_rollup_pendente is
  'Dias que tem evento medido e NAO tem rollup. Deveria estar sempre vazia: linha aqui significa que o relatorio esta mostrando zero para um dia que teve movimento.';

grant select on public.v_rollup_pendente to authenticated;

-- ── As views do BI, agora lendo do rollup ──────────────────────────────────
create or replace view public.v_bi_visits_hourly as
select
  r.tenant_id,
  ch.name as rede,
  s.name  as loja,
  s.city  as cidade,
  s.state as uf,
  case s.kind
    when 'shopping'::store_kind then 'Shopping'
    when 'street'::store_kind   then 'Rua'
    else 'Outro'
  end as tipo_local,
  d.code  as codigo,
  d.name  as aparelho,
  m.name  as modelo,
  m.line  as linha,
  r.hora_local,
  -- Tipos IDENTICOS aos da view antiga, de proposito: `visitas` era bigint e
  -- `segundos_uso` era numeric. sum() de bigint devolve numeric, entao sem o cast
  -- explicito o Postgres recusa a substituicao ("cannot change data type of view
  -- column") — e, pior, se aceitasse, mudaria silenciosamente o tipo que o BI em
  -- planilha da ProSolution consome.
  sum(r.visitas)::bigint       as visitas,
  sum(r.segundos_uso)::numeric as segundos_uso
from public.rollup_visita_hora r
join public.devices d on d.id = r.device_id
left join public.device_models m on m.id = d.model_id
left join public.stores s on s.id = d.store_id
left join public.retail_chains ch on ch.id = s.chain_id
-- Hora sem visita nenhuma existe no rollup (a linha guarda a vitrine daquela
-- hora). A view de VISITAS nao pode devolve-la, senao "lojas com dado" contaria
-- loja que so teve tela acesa e ninguem encostou.
where r.visitas > 0
group by r.tenant_id, ch.name, s.name, s.city, s.state, s.kind,
         d.code, d.name, m.name, m.line, r.hora_local;

create or replace view public.v_bi_showcase_hourly as
select
  r.tenant_id,
  ch.name as rede,
  s.name  as loja,
  s.city  as cidade,
  s.state as uf,
  case s.kind
    when 'shopping'::store_kind then 'Shopping'
    when 'street'::store_kind   then 'Rua'
    else 'Outro'
  end as tipo_local,
  d.code  as codigo,
  d.name  as aparelho,
  m.name  as modelo,
  m.line  as linha,
  r.hora_local,
  sum(r.segundos_vitrine)::bigint as segundos_vitrine
from public.rollup_visita_hora r
join public.devices d on d.id = r.device_id
left join public.device_models m on m.id = d.model_id
left join public.stores s on s.id = d.store_id
left join public.retail_chains ch on ch.id = s.chain_id
where r.segundos_vitrine > 0
group by r.tenant_id, ch.name, s.name, s.city, s.state, s.kind,
         d.code, d.name, m.name, m.line, r.hora_local;

comment on view public.v_bi_visits_hourly is
  'Visitas por hora, do rollup (nao mais de device_events cru). Paridade provada na migration 20260730020000. Buraco no rollup aparece em v_rollup_pendente.';
comment on view public.v_bi_showcase_hourly is
  'Segundos de vitrine por hora, do rollup. Mesma observacao de paridade e de vigia.';

-- ── O QUE ESTA MIGRATION NAO RESOLVE, medido ────────────────────────────────
-- fleet_report caiu de 132,8 ms para 85,4 ms: 36%, e nao os 250x que a consulta
-- isolada mostrou. O motivo esta na propria estrutura e vale escrito:
--
--   v_bi_visits_hourly     -> rollup   (era o unico com janela sem limite)
--   v_bi_showcase_hourly   -> rollup
--   v_bi_interaction_hourly-> device_events CRU  (recurso por app)
--   v_bi_media_hourly      -> device_events CRU  (midia no ar)
--
-- As duas que sobraram nao tem window function — o problema grave saiu. Mas
-- continuam varrendo device_events, e por isso o custo restante cresce com o
-- historico, so mais devagar.
--
-- Elas ficaram de fora de proposito, e nao por falta de tempo: cada uma agrega por
-- uma dimensao propria (pacote de app, id de midia) que o rollup atual nao guarda.
-- Enfia-las na mesma tabela faria uma linha por aparelho/hora/app/midia — o
-- oposto de um rollup. Precisam de tabela propria, com a mesma disciplina: espelhar
-- a semantica, provar paridade, e so depois repontuar.
