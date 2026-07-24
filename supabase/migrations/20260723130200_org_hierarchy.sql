-- LINKA — hierarquia de varejo: redes → lojas (país/fuso) → posições.
-- tenant_id é replicado em cada nível para manter as políticas RLS simples e rápidas.

-- ── Redes ─────────────────────────────────────────────────────────────────
create table public.retail_chains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);
comment on table public.retail_chains is 'Rede varejista (ex.: Casas Bahia, Ponto Frio) dentro de um tenant.';
create index on public.retail_chains (tenant_id);

-- ── Lojas ─────────────────────────────────────────────────────────────────
create type public.store_kind as enum ('shopping', 'street', 'other');

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  chain_id uuid references public.retail_chains (id) on delete set null,
  code text,                                              -- código do PDV (ex.: SPC7613)
  name text not null,
  kind public.store_kind not null default 'other',        -- shopping vs. rua (corte do BI)
  address text,
  city text,
  state text,
  country char(2) not null default 'BR',                  -- ISO 3166-1 alpha-2 (LATAM-ready)
  timezone text not null default 'America/Sao_Paulo',     -- IANA tz — toda análise horária usa o fuso da loja
  latitude double precision,
  longitude double precision,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);
comment on table public.stores is 'Loja/PDV. country + timezone tornam o produto LATAM-ready desde o dia 1.';
comment on column public.stores.timezone is 'Fuso IANA da loja; toda métrica horária é calculada neste fuso (obrigatório inclusive no Brasil, que tem 4 fusos).';
comment on column public.stores.kind is 'Tipo de local: shopping ou rua — dimensão usada no BI (Interações por Local).';
create index on public.stores (tenant_id);
create index on public.stores (chain_id);

-- ── Posições ──────────────────────────────────────────────────────────────
create table public.positions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  label text not null,                                    -- ex.: "Mesa 3", "Vitrine Moto Edge"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.positions is 'Posição física dentro da loja (mesa/seção) onde um aparelho fica exposto.';
create index on public.positions (store_id);
create index on public.positions (tenant_id);

-- updated_at automático.
create trigger set_updated_at before update on public.retail_chains
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.stores
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.positions
  for each row execute function public.set_updated_at();
