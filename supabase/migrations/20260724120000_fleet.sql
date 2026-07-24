-- LINKA — R1 Frota: dispositivos, modelos e grupos.
-- Baseado no modelo real do Product.Me (docs/REFERENCIA-PRODUCT-ME.md §2, §8).

-- ── Enums ─────────────────────────────────────────────────────────────────
create type public.device_status as enum ('provisioning', 'online', 'degraded', 'offline');
create type public.device_mode as enum ('not_running', 'main_menu', 'show', 'protection', 'sleep', 'alarm');
create type public.device_platform as enum ('android', 'ios');

-- ── Modelos (produto/modelo) ──────────────────────────────────────────────
-- Usado para cortes de frota por linha/modelo (BI) e, no futuro, dono da etiqueta digital.
create table public.device_models (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,                       -- ex.: "Moto G06"
  line text,                                -- ex.: "Moto G", "Moto Edge", "Moto Razr", "Signature"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);
comment on table public.device_models is 'Modelo/produto de aparelho (ex.: Moto G06). Base dos cortes por linha/modelo e futuro dono da etiqueta digital.';
create index on public.device_models (tenant_id);

-- ── Grupos de dispositivos ────────────────────────────────────────────────
create table public.device_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);
comment on table public.device_groups is 'Agrupamento de dispositivos para operações e segmentação.';
create index on public.device_groups (tenant_id);

-- ── Dispositivos (frota) ──────────────────────────────────────────────────
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text,                                -- código do device (ex.: "101")
  name text not null,                       -- nome (ex.: "motog17")
  model_id uuid references public.device_models (id) on delete set null,
  store_id uuid references public.stores (id) on delete set null,
  position_id uuid references public.positions (id) on delete set null,
  group_id uuid references public.device_groups (id) on delete set null,
  platform public.device_platform not null default 'android',
  imei text,
  serial text,
  os_version text,                          -- versão do Android
  agent_version text,                       -- versão do agente LINKA
  status public.device_status not null default 'provisioning',
  mode public.device_mode,                  -- estado atual (show, main_menu, protection, sleep, not_running, alarm)
  battery_level int check (battery_level between 0 and 100),
  battery_charging boolean,
  synced boolean not null default false,    -- conteúdo sincronizado
  app_updated boolean not null default false, -- agente na versão atual
  is_active boolean not null default true,
  last_seen_at timestamptz,                 -- último heartbeat
  provisioning_code text,                   -- código de pareamento (provisionamento)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);
comment on table public.devices is 'Aparelho da frota. Snapshot de estado (status/mode/bateria/last_seen) atualizado pelo agente; histórico de eventos vem no R2.';
comment on column public.devices.last_seen_at is 'Último contato do agente (heartbeat). Principal sinal de saúde — base do "Last Communication".';
create index on public.devices (tenant_id);
create index on public.devices (store_id);
create index on public.devices (model_id);
create index on public.devices (status);

-- ── updated_at ────────────────────────────────────────────────────────────
create trigger set_updated_at before update on public.device_models
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.device_groups
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.devices
  for each row execute function public.set_updated_at();

-- ── RLS: leitura = membros do tenant; escrita = agência + superadmin ──────
alter table public.device_models enable row level security;
alter table public.device_groups enable row level security;
alter table public.devices enable row level security;

create policy models_select on public.device_models
  for select using (private.has_tenant_access(tenant_id));
create policy models_insert on public.device_models
  for insert with check (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
create policy models_update on public.device_models
  for update using (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]))
  with check (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
create policy models_delete on public.device_models
  for delete using (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));

create policy groups_select on public.device_groups
  for select using (private.has_tenant_access(tenant_id));
create policy groups_insert on public.device_groups
  for insert with check (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
create policy groups_update on public.device_groups
  for update using (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]))
  with check (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
create policy groups_delete on public.device_groups
  for delete using (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));

create policy devices_select on public.devices
  for select using (private.has_tenant_access(tenant_id));
create policy devices_insert on public.devices
  for insert with check (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
create policy devices_update on public.devices
  for update using (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]))
  with check (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
create policy devices_delete on public.devices
  for delete using (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
