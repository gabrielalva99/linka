-- LINKA — rollup por hora. O que faz a conta fechar com 250 aparelhos, e com 10 mil.
--
-- O PROBLEMA, medido em 30/07 com EXPLAIN ANALYZE. A view `v_visits` — que
-- sustenta visitas em TODO o relatorio — nao tem filtro de tempo:
--
--   sum(nova) over (partition by device_id order by started_at rows unbounded preceding)
--
-- A janela percorre o historico INTEIRO de cada aparelho, sempre. Filtrar
-- "ultimos 2 dias" na consulta nao ajuda: o plano mostra `Seq Scan on
-- device_events` e o filtro de data aplicado DEPOIS da agregacao
-- (Rows Removed by Filter, no nivel do GroupAggregate). Os indices existem e sao
-- bons — nenhum e usado, porque nao ha predicado de tempo para empurrar.
--
-- Hoje: 49 ms para 1.345 eventos. A conta da expansao: 250 aparelhos a ~100
-- eventos/dia = 25 mil/dia = ~750 mil/mes. Em seis meses, ~4,5 milhoes de linhas
-- varridas a cada abertura de relatorio. E a tela inicial se recarrega sozinha.
--
-- POR QUE UM ROLLUP E NAO SO UM INDICE. O custo nao esta na busca, esta no
-- recalculo: detectar "onde comeca cada visita" exige olhar o evento anterior,
-- e isso e trabalho proporcional ao historico. Indice nao remove trabalho que
-- precisa acontecer; rollup faz o trabalho UMA vez, por hora, e guarda.
--
-- O `CLAUDE.md` ja dizia isto desde o inicio: "dashboards leem apenas rollups,
-- nunca device_events cru". Era decisao tomada e nao construida.
--
-- ── Como a correcao mantem UMA verdade ─────────────────────────────────────
-- O risco obvio de criar rollup e passar a ter dois numeros para a mesma
-- pergunta — o defeito que esta varredura passou o dia consertando. Por isso:
--   1. o rollup espelha a semantica das views atuais, linha por linha
--      (mesma regra de ilha de 90s, mesmo corte de ruido, mesmo
--      exclude_from_reports, mesmo fatiamento por expediente da loja);
--   2. a migration seguinte SO repontua as views depois de o teste de paridade
--      bater exatamente. Sem paridade provada, o rollup e so uma tabela nova.
--
-- ── Por que recalcular por DIA e nao por hora ──────────────────────────────
-- Uma visita que comeca 13h59 e termina 14h05 pertence a hora 13 (a view usa
-- min(started_at)). Processando so a janela [14h,15h), essa visita apareceria
-- cortada e viraria uma visita fantasma na hora 14. Recalcular o dia inteiro,
-- com uma hora de folga de cada lado para o lag() acertar, elimina a classe.
-- E idempotente: rodar duas vezes da o mesmo resultado.

create table if not exists public.rollup_visita_hora (
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  device_id        uuid not null references public.devices (id) on delete cascade,
  -- Hora LOCAL da loja, ja convertida. Sem fuso de proposito: e a hora que
  -- aconteceu para quem estava lá, e é a chave que o BI usa.
  hora_local       timestamp not null,
  visitas          integer not null default 0,
  segundos_uso     bigint  not null default 0,
  segundos_vitrine bigint  not null default 0,
  atualizado_em    timestamptz not null default now(),
  primary key (device_id, hora_local)
);

comment on table public.rollup_visita_hora is
  'Visitas, uso e vitrine por aparelho e hora local. Preenchido por preencher_rollup_dia(); espelha v_visits + v_bi_showcase_hourly. Ver migration 20260730010000.';

create index if not exists rollup_visita_hora_tenant
  on public.rollup_visita_hora (tenant_id, hora_local desc);

alter table public.rollup_visita_hora enable row level security;

-- Leitura pelo mesmo criterio das outras tabelas do cliente.
drop policy if exists rollup_select on public.rollup_visita_hora;
create policy rollup_select on public.rollup_visita_hora
  for select to authenticated
  using (private.has_tenant_access(tenant_id));

-- Escrita: ninguem. Quem preenche e a funcao (security definer) e o cron. Numero
-- de relatorio que o usuario consegue escrever nao e numero, e opiniao.
revoke all on public.rollup_visita_hora from anon, authenticated;
grant select on public.rollup_visita_hora to authenticated;

-- ── O preenchimento ────────────────────────────────────────────────────────
create or replace function public.preencher_rollup_dia(p_dia date default null)
returns integer language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_dia    date;
  v_linhas integer;
begin
  -- Sem dia: hoje no fuso da operacao.
  v_dia := coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date);

  with limites as (
    -- Uma hora de folga de cada lado: o lag() precisa do evento anterior para
    -- decidir se a visita e nova, e ele pode estar do outro lado da meia-noite.
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
  -- Uma linha por visita, na hora em que ela COMECOU (igual a view).
  visitas as (
    select tenant_id, device_id,
           date_trunc('hour', (min(started_at) at time zone min(fuso))) as hora_local,
           count(*) filter (where true) as _ignorado,
           sum(segundos) as segundos_uso
    from ilhas
    where kind = 'app_usage'
    group by tenant_id, device_id, visita
  ),
  visitas_hora as (
    select tenant_id, device_id, hora_local,
           count(*)::int as visitas, sum(segundos_uso)::bigint as segundos_uso
    from visitas
    where hora_local >= v_dia::timestamp and hora_local < (v_dia + 1)::timestamp
    group by 1,2,3
  ),
  -- Vitrine: fatiada por hora e cortada no expediente, igual a view.
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
  ),
  apagado as (
    delete from public.rollup_visita_hora r
    where r.hora_local >= v_dia::timestamp and r.hora_local < (v_dia + 1)::timestamp
    returning 1
  )
  insert into public.rollup_visita_hora
    (tenant_id, device_id, hora_local, visitas, segundos_uso, segundos_vitrine)
  select tenant_id, device_id, hora_local, visitas, segundos_uso, segundos_vitrine
  from juntos
  where tenant_id is not null and device_id is not null and hora_local is not null;

  get diagnostics v_linhas = row_count;
  return v_linhas;
end; $fn$;

comment on function public.preencher_rollup_dia(date) is
  'Recalcula o rollup de um dia inteiro (idempotente). Dia inteiro e nao hora porque visita que atravessa a hora pertence a hora em que comecou.';

revoke all on function public.preencher_rollup_dia(date) from public, anon, authenticated;

-- ── Agenda ─────────────────────────────────────────────────────────────────
-- De hora em hora: recalcula HOJE e ONTEM. Ontem tambem porque evento chega
-- atrasado (aparelho sem rede na loja guarda a fila e manda depois) — e um
-- numero que "fecha" e depois muda sozinho e pior do que um numero que demora.
select cron.schedule(
  'rollup-visita-hora',
  '7 * * * *',
  $cron$
    select public.preencher_rollup_dia((now() at time zone 'America/Sao_Paulo')::date);
    select public.preencher_rollup_dia((now() at time zone 'America/Sao_Paulo')::date - 1);
  $cron$
);
