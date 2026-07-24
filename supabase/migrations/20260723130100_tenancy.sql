-- LINKA — núcleo multi-tenant: perfis, tenants e vínculos (memberships).
-- Isolamento entre tenants é garantido por RLS (ver 20260723130300_rls_policies.sql).

-- ── Perfis ────────────────────────────────────────────────────────────────
-- 1:1 com auth.users. is_superadmin = operador da plataforma LINKA (vê tudo).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  is_superadmin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Perfil do usuário; estende auth.users. is_superadmin marca operadores da plataforma LINKA.';

-- ── Tenants ───────────────────────────────────────────────────────────────
-- Cliente/marca da plataforma (ex.: Motorola). Fronteira de isolamento de dados.
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.tenants is 'Cliente/marca da plataforma (ex.: Motorola). Fronteira de isolamento de dados.';

-- ── Memberships ───────────────────────────────────────────────────────────
-- Papéis dentro de um tenant. Um usuário pode servir vários tenants (ex.: agência).
create type public.membership_role as enum ('agency', 'client', 'field');

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  role public.membership_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, tenant_id)
);
comment on table public.memberships is 'Acesso de um usuário a um tenant, com papel. Superadmin não precisa de linha aqui (vê tudo).';
create index on public.memberships (tenant_id);
create index on public.memberships (user_id);

-- ── Funções auxiliares de autorização ─────────────────────────────────────
-- SECURITY DEFINER: leem sem passar por RLS, evitando recursão nas políticas.
create or replace function public.is_superadmin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select p.is_superadmin from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.user_tenant_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select m.tenant_id from public.memberships m where m.user_id = auth.uid();
$$;

create or replace function public.has_tenant_access(target uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_superadmin() or target in (select public.user_tenant_ids());
$$;

-- Acesso de escrita por papel (ex.: gestão de cadastros = agência + superadmin).
create or replace function public.has_tenant_role(target uuid, roles public.membership_role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_superadmin() or exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.tenant_id = target and m.role = any (roles)
  );
$$;

-- ── Gatilhos ──────────────────────────────────────────────────────────────
-- Cria o perfil automaticamente quando um usuário se registra no auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at automático.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.tenants
  for each row execute function public.set_updated_at();
