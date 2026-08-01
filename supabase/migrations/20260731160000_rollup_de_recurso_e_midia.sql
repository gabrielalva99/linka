-- LINKA - o rollup passa a cobrir recurso-por-app e midia (os 36% que faltavam).
--
-- ONDE ISTO ENTRA. A migration 20260730010000 tirou visitas e vitrine do dado
-- cru. Sobraram duas views de BI lendo device_events direto, contra a regra do
-- CLAUDE.md ("dashboards leem apenas rollups, nunca device_events cru"):
-- v_bi_interaction_hourly (recurso) e v_bi_media_hourly (midia).
--
-- POR QUE A DE MIDIA E A PIOR DAS DUAS. Medido agora com EXPLAIN ANALYZE, com
-- 2.519 eventos de midia e 26 visitas no banco inteiro:
--
--   Execution Time: 74,8 ms para devolver 147 linhas
--   Hash Join ... Rows Removed by Join Filter: 13.955
--
-- Esse "rows removed" e o retrato do problema. Para saber quais visitas caem
-- dentro de cada trecho de video, o banco cruza TODO trecho com TODA visita e
-- joga fora o que nao encaixa. O trabalho e o produto dos dois, nao a soma: hoje
-- 2.519 x 26; com 250 aparelhos e seis meses, algo como 4,5 milhoes de trechos
-- por 900 mil visitas. Nao e uma tela que fica lenta - e uma tela que para.
--
-- E o plano ainda mostra v_visits sendo recalculada por dentro (WindowAgg sobre
-- o historico inteiro), que e exatamente o custo que o rollup de visitas existe
-- para nao pagar duas vezes.
--
-- -- A MESMA DISCIPLINA DA VEZ ANTERIOR -------------------------------------
-- Este arquivo SO cria e preenche. As views continuam lendo o cru ate a
-- paridade ser provada linha a linha; quem repontua e a migration seguinte. Sem
-- paridade provada, isto aqui e so tabela nova sem consequencia.
--
-- -- UMA FUNCAO SO, TRES TABELAS --------------------------------------------
-- preencher_rollup_dia continua sendo o unico lugar que preenche rollup, e passa
-- a preencher as tres na mesma transacao e no mesmo dia. Isso importa: com duas
-- funcoes, um dia poderia ficar com visitas preenchidas e midia nao, e o
-- relatorio mostraria vitrine sem as paradas correspondentes - numero errado,
-- sem erro nenhum aparecendo. O cron que ja existe passa a cobrir as tres sem
-- ninguem lembrar de nada.

-- ---------------------------------------------------------------------------
-- Recurso por hora (o que o cliente da loja experimentou no aparelho).
-- ---------------------------------------------------------------------------
create table if not exists public.rollup_recurso_hora (
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  device_id     uuid not null references public.devices (id) on delete cascade,
  hora_local    timestamp not null,
  -- O nome de NEGOCIO ("Camera"), nao o pacote. Dois pacotes com o mesmo rotulo
  -- somam numa linha so, igual a view faz - e o rotulo e o que a marca le.
  recurso       text not null,
  categoria     text,
  sessoes       integer not null default 0,
  segundos      bigint  not null default 0,
  atualizado_em timestamptz not null default now()
);

-- Chave por EXPRESSAO, e nao chave primaria, porque categoria pode ser nula:
-- pacote ausente do catalogo entra com o nome tecnico e sem categoria (e assim
-- de proposito - ver comentario de app_catalog). Chave primaria nao aceita nulo,
-- e deixar categoria fora da chave faria duas linhas legitimas colidirem no dia
-- em que o mesmo rotulo aparecesse com categorias diferentes.
create unique index if not exists rollup_recurso_hora_chave
  on public.rollup_recurso_hora (device_id, hora_local, recurso, coalesce(categoria, ''));

create index if not exists rollup_recurso_hora_tenant
  on public.rollup_recurso_hora (tenant_id, hora_local desc);

comment on table public.rollup_recurso_hora is
  'Sessoes e segundos por recurso, aparelho e hora local. Espelha v_bi_interaction_hourly. Preenchido por preencher_rollup_dia(). Ver migration 20260731160000.';

-- ---------------------------------------------------------------------------
-- Midia por hora (o que esteve no ar, e o que o publico parou para ver).
-- ---------------------------------------------------------------------------
create table if not exists public.rollup_midia_hora (
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  device_id      uuid not null references public.devices (id) on delete cascade,
  hora_local     timestamp not null,
  midia          text not null,
  -- Tempo no ar ja recortado pelo expediente da loja: video rodando com a loja
  -- fechada nao e vitrine, e contar isso inflaria o numero que a marca compra.
  segundos_no_ar bigint  not null default 0,
  -- Visitas que COMECARAM enquanto este video estava na tela. E a unica ponte
  -- entre conteudo e interesse do publico - o numero que responde "qual video
  -- faz gente parar".
  visitas        integer not null default 0,
  segundos_uso   bigint  not null default 0,
  atualizado_em  timestamptz not null default now(),
  primary key (device_id, hora_local, midia)
);

create index if not exists rollup_midia_hora_tenant
  on public.rollup_midia_hora (tenant_id, hora_local desc);

comment on table public.rollup_midia_hora is
  'Tempo no ar e paradas do publico por midia, aparelho e hora local. Espelha v_bi_media_hourly. Preenchido por preencher_rollup_dia(). Ver migration 20260731160000.';

-- ---------------------------------------------------------------------------
-- Isolamento, igual ao rollup de visitas.
-- ---------------------------------------------------------------------------
--
-- As views de BI rodam com os poderes de QUEM CONSULTA (security_invoker), entao
-- sem politica aqui a tabela ficaria fechada para o painel e os relatorios
-- voltariam vazios - falha silenciosa, do jeito que o RLS erra: SELECT barrado
-- devolve 200 com lista vazia, nao erro. E ligar RLS sem politica seria pior do
-- que nao ligar: pareceria protegido e entregaria nada.
--
-- Mesma regra do rollup_visita_hora, palavra por palavra: cada um enxerga o
-- proprio cliente. Ninguem escreve por aqui - quem preenche e a funcao, que roda
-- com poderes proprios (security definer).
alter table public.rollup_recurso_hora enable row level security;
alter table public.rollup_midia_hora  enable row level security;

drop policy if exists rollup_recurso_select on public.rollup_recurso_hora;
create policy rollup_recurso_select on public.rollup_recurso_hora
  for select to authenticated using (private.has_tenant_access(tenant_id));

drop policy if exists rollup_midia_select on public.rollup_midia_hora;
create policy rollup_midia_select on public.rollup_midia_hora
  for select to authenticated using (private.has_tenant_access(tenant_id));

-- ---------------------------------------------------------------------------
-- O preenchimento, agora das tres.
-- ---------------------------------------------------------------------------
create or replace function public.preencher_rollup_dia(p_dia date default null::date)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_dia    date;
  v_linhas integer;
  v_extra  integer;
begin
  v_dia := coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date);

  delete from public.rollup_visita_hora r
  where r.hora_local >= v_dia::timestamp and r.hora_local < (v_dia + 1)::timestamp;
  delete from public.rollup_recurso_hora r
  where r.hora_local >= v_dia::timestamp and r.hora_local < (v_dia + 1)::timestamp;
  delete from public.rollup_midia_hora r
  where r.hora_local >= v_dia::timestamp and r.hora_local < (v_dia + 1)::timestamp;

  with limites as (
    select (v_dia - 1)::timestamp as ini_folga,
           (v_dia + 2)::timestamp as fim_folga
  ),
  bruto as (
    select
      e.tenant_id, e.device_id, e.started_at, e.ended_at,
      coalesce(e.duration_seconds, 0) as segundos,
      e.kind::text as kind,
      coalesce(s.timezone, 'America/Sao_Paulo') as fuso,
      case
        when e.kind = 'showcase' then 1
        when lag(e.ended_at) over (partition by e.device_id order by e.started_at) is null
          or (e.started_at - lag(e.ended_at) over (partition by e.device_id order by e.started_at))
             > interval '90 seconds'
        then 1 else 0
      end as nova
    from public.device_events e
    join public.devices d on d.id = e.device_id
    left join public.stores s on s.id = d.store_id
    left join public.app_catalog c on c.package = e.package
    cross join limites l
    where e.kind in ('app_usage','showcase')
      and (e.kind <> 'app_usage' or coalesce(c.is_noise, false) = false)
      and not d.exclude_from_reports
      and e.started_at >= (l.ini_folga at time zone 'America/Sao_Paulo')
      and e.started_at <  (l.fim_folga at time zone 'America/Sao_Paulo')
  ),
  ilhas as (
    select *, sum(nova) over (partition by device_id order by started_at
                              rows unbounded preceding) as visita
    from bruto
  ),
  -- `inicio` entrou aqui: e o que liga uma visita ao video que estava na tela
  -- quando ela comecou. Sem ele, a midia teria de recalcular as ilhas por conta
  -- propria - duas copias da regra de visita, que e o defeito que este projeto
  -- ja pagou caro para nao ter.
  visitas as (
    select tenant_id, device_id,
           min(started_at) as inicio,
           date_trunc('hour', (min(started_at) at time zone min(fuso))) as hora_local,
           sum(segundos) as segundos_uso
    from ilhas
    where kind = 'app_usage'
    group by tenant_id, device_id, visita
  ),
  visitas_do_dia as (
    select * from visitas
    where hora_local >= v_dia::timestamp and hora_local < (v_dia + 1)::timestamp
  ),
  visitas_hora as (
    select tenant_id, device_id, hora_local,
           count(*)::int as visitas, sum(segundos_uso)::bigint as segundos_uso
    from visitas_do_dia
    group by 1,2,3
  ),
  vitrine_hora as (
    select e.tenant_id, e.device_id, f.hora_local, sum(f.segundos)::bigint as segundos_vitrine
    from public.device_events e
    join public.devices d on d.id = e.device_id
    left join public.stores s on s.id = d.store_id
    cross join limites l
    cross join lateral slice_hours(
      e.started_at,
      coalesce(e.ended_at, e.started_at + make_interval(secs => coalesce(e.duration_seconds,0))),
      coalesce(s.timezone,'America/Sao_Paulo'),
      coalesce(s.opens_at,'09:00'), coalesce(s.closes_at,'22:00')
    ) f(hora_local, segundos)
    where e.kind = 'showcase'
      and not d.exclude_from_reports
      and f.segundos > 0
      and e.started_at >= (l.ini_folga at time zone 'America/Sao_Paulo')
      and e.started_at <  (l.fim_folga at time zone 'America/Sao_Paulo')
      and f.hora_local >= v_dia::timestamp and f.hora_local < (v_dia + 1)::timestamp
    group by 1,2,3
  ),
  juntos as (
    select
      coalesce(v.tenant_id, w.tenant_id)   as tenant_id,
      coalesce(v.device_id, w.device_id)   as device_id,
      coalesce(v.hora_local, w.hora_local) as hora_local,
      coalesce(v.visitas, 0)               as visitas,
      coalesce(v.segundos_uso, 0)          as segundos_uso,
      coalesce(w.segundos_vitrine, 0)      as segundos_vitrine
    from visitas_hora v
    full join vitrine_hora w
      on w.device_id = v.device_id and w.hora_local = v.hora_local
  )
  insert into public.rollup_visita_hora
    (tenant_id, device_id, hora_local, visitas, segundos_uso, segundos_vitrine)
  select tenant_id, device_id, hora_local, visitas, segundos_uso, segundos_vitrine
  from juntos
  where tenant_id is not null and device_id is not null and hora_local is not null;

  get diagnostics v_linhas = row_count;

  -- -- Recurso ---------------------------------------------------------------
  -- Sem folga de um dia aqui, ao contrario das outras duas: este agrupamento nao
  -- olha o evento vizinho nem fatia por hora, entao a hora local sai direto do
  -- proprio evento. So o que cai no dia importa.
  insert into public.rollup_recurso_hora
    (tenant_id, device_id, hora_local, recurso, categoria, sessoes, segundos)
  select
    e.tenant_id, e.device_id,
    date_trunc('hour', (e.started_at at time zone coalesce(s.timezone, 'America/Sao_Paulo'))) as hora_local,
    coalesce(c.label, e.package) as recurso,
    c.category as categoria,
    count(*)::int as sessoes,
    coalesce(sum(e.duration_seconds), 0)::bigint as segundos
  from public.device_events e
  join public.devices d on d.id = e.device_id
  left join public.stores s on s.id = d.store_id
  left join public.app_catalog c on c.package = e.package
  where e.kind = 'app_usage'
    and coalesce(c.is_noise, false) = false
    and not d.exclude_from_reports
    and date_trunc('hour', (e.started_at at time zone coalesce(s.timezone, 'America/Sao_Paulo')))
        >= v_dia::timestamp
    and date_trunc('hour', (e.started_at at time zone coalesce(s.timezone, 'America/Sao_Paulo')))
        <  (v_dia + 1)::timestamp
  group by 1,2,3,4,5;

  get diagnostics v_extra = row_count;
  v_linhas := v_linhas + v_extra;

  -- -- Midia -----------------------------------------------------------------
  with limites as (
    select (v_dia - 1)::timestamp as ini_folga,
           (v_dia + 2)::timestamp as fim_folga
  ),
  segmentos as (
    select
      e.tenant_id, e.device_id,
      coalesce(mm.name, e.media_name, 'midia removida') as midia,
      e.started_at,
      coalesce(e.ended_at, e.started_at + make_interval(secs => coalesce(e.duration_seconds, 0))) as ended_at,
      coalesce(s.timezone, 'America/Sao_Paulo') as tz,
      coalesce(s.opens_at, '09:00') as abre,
      coalesce(s.closes_at, '22:00') as fecha
    from public.device_events e
    join public.devices d on d.id = e.device_id
    left join public.stores s on s.id = d.store_id
    left join public.media_assets mm on mm.id = e.media_id
    cross join limites l
    where e.kind = 'media_play'
      and not d.exclude_from_reports
      and e.started_at >= (l.ini_folga at time zone 'America/Sao_Paulo')
      and e.started_at <  (l.fim_folga at time zone 'America/Sao_Paulo')
  ),
  -- As ilhas de visita, de novo - mesma regra de 90s, mesmo corte de ruido.
  -- Repetidas aqui porque um CTE nao atravessa comandos; a REGRA continua uma
  -- so, e a paridade provada e o que garante que continuem iguais.
  bruto as (
    select
      e.tenant_id, e.device_id, e.started_at, e.ended_at,
      coalesce(e.duration_seconds, 0) as segundos,
      e.kind::text as kind,
      coalesce(s.timezone, 'America/Sao_Paulo') as fuso,
      case
        when e.kind = 'showcase' then 1
        when lag(e.ended_at) over (partition by e.device_id order by e.started_at) is null
          or (e.started_at - lag(e.ended_at) over (partition by e.device_id order by e.started_at))
             > interval '90 seconds'
        then 1 else 0
      end as nova
    from public.device_events e
    join public.devices d on d.id = e.device_id
    left join public.stores s on s.id = d.store_id
    left join public.app_catalog c on c.package = e.package
    cross join limites l
    where e.kind in ('app_usage','showcase')
      and (e.kind <> 'app_usage' or coalesce(c.is_noise, false) = false)
      and not d.exclude_from_reports
      and e.started_at >= (l.ini_folga at time zone 'America/Sao_Paulo')
      and e.started_at <  (l.fim_folga at time zone 'America/Sao_Paulo')
  ),
  ilhas as (
    select *, sum(nova) over (partition by device_id order by started_at
                              rows unbounded preceding) as visita
    from bruto
  ),
  visitas as (
    select tenant_id, device_id,
           min(started_at) as inicio,
           date_trunc('hour', (min(started_at) at time zone min(fuso))) as hora_local,
           sum(segundos) as segundos_uso
    from ilhas
    where kind = 'app_usage'
    group by tenant_id, device_id, visita
  ),
  no_ar as (
    select g.tenant_id, g.device_id, g.midia, f.hora_local,
           sum(f.segundos)::bigint as segundos_no_ar
    from segmentos g
    cross join lateral slice_hours(g.started_at, g.ended_at, g.tz, g.abre, g.fecha)
      f(hora_local, segundos)
    where f.segundos > 0
      and f.hora_local >= v_dia::timestamp and f.hora_local < (v_dia + 1)::timestamp
    group by 1,2,3,4
  ),
  paradas as (
    select g.tenant_id, g.device_id, g.midia, v.hora_local,
           count(*)::int as visitas,
           sum(v.segundos_uso)::bigint as segundos_uso
    from visitas v
    join segmentos g
      on g.device_id = v.device_id
     and v.inicio >= g.started_at
     and v.inicio <  g.ended_at
    where v.hora_local >= v_dia::timestamp and v.hora_local < (v_dia + 1)::timestamp
    group by 1,2,3,4
  )
  insert into public.rollup_midia_hora
    (tenant_id, device_id, hora_local, midia, segundos_no_ar, visitas, segundos_uso)
  select
    coalesce(n.tenant_id, p.tenant_id),
    coalesce(n.device_id, p.device_id),
    coalesce(n.hora_local, p.hora_local),
    coalesce(n.midia, p.midia),
    coalesce(n.segundos_no_ar, 0),
    coalesce(p.visitas, 0),
    coalesce(p.segundos_uso, 0)
  from no_ar n
  full join paradas p
    on p.device_id = n.device_id and p.midia = n.midia and p.hora_local = n.hora_local
  where coalesce(n.tenant_id, p.tenant_id) is not null
    and coalesce(n.device_id, p.device_id) is not null
    and coalesce(n.hora_local, p.hora_local) is not null;

  get diagnostics v_extra = row_count;
  v_linhas := v_linhas + v_extra;

  return v_linhas;
end; $function$;

comment on function public.preencher_rollup_dia(date) is
  'Recalcula o dia inteiro nas TRES tabelas de rollup, numa transacao so. Idempotente. Uma funcao so para nenhum dia ficar com visitas preenchidas e midia nao.';
