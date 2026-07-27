-- LINKA — telemetria de interação (CONTRATO-DE-DADOS: device × hora × interações).
-- O aparelho é a fonte da verdade e a rede da loja cai: por isso cada evento
-- carrega um id gerado no próprio aparelho e a ingestão é idempotente. Reenvio
-- depois de uma queda não pode virar contagem dobrada no BI.
create type public.event_kind as enum ('app_usage', 'screen_session');

create table public.device_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  event_id text not null,
  kind public.event_kind not null,
  package text,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer,
  created_at timestamptz not null default now(),
  constraint device_events_unique unique (device_id, event_id)
);

comment on table public.device_events is 'Eventos crus de interação. Dashboards leem rollups, nunca esta tabela (ARQUITETURA ADR-4).';
comment on column public.device_events.event_id is 'Gerado no aparelho — é o que torna o reenvio seguro.';

create index device_events_tenant_time on public.device_events (tenant_id, started_at desc);
create index device_events_device_time on public.device_events (device_id, started_at desc);

alter table public.device_events enable row level security;
create policy events_select on public.device_events
  for select using (private.has_tenant_access(tenant_id));
