-- LINKA — endurecimento de segurança (resolve os avisos do Supabase advisors).
-- 1) Move as funções de autorização para o schema `private` (fora da API REST) — assim
--    deixam de ser chamáveis via /rest/v1/rpc, mas continuam disponíveis para o RLS.
-- 2) Fixa search_path das funções restantes.
-- 3) Remove a exposição RPC do gatilho handle_new_user.

create schema if not exists private;

-- ── Helpers de autorização, agora em `private` ────────────────────────────
create or replace function private.is_superadmin()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((select p.is_superadmin from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function private.user_tenant_ids()
returns setof uuid language sql stable security definer set search_path = public
as $$
  select m.tenant_id from public.memberships m where m.user_id = auth.uid();
$$;

create or replace function private.has_tenant_access(target uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select private.is_superadmin() or target in (select private.user_tenant_ids());
$$;

create or replace function private.has_tenant_role(target uuid, roles public.membership_role[])
returns boolean language sql stable security definer set search_path = public
as $$
  select private.is_superadmin() or exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.tenant_id = target and m.role = any (roles)
  );
$$;

-- RLS precisa poder avaliar os helpers; como o schema `private` não é exposto na API,
-- conceder execute aqui não cria endpoint RPC.
grant usage on schema private to anon, authenticated, service_role;
grant execute on all functions in schema private to anon, authenticated, service_role;

-- ── Recriar políticas apontando para os helpers em `private` ──────────────
drop policy profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
  for select using (id = auth.uid() or private.is_superadmin());

drop policy tenants_select_member_or_admin on public.tenants;
create policy tenants_select_member_or_admin on public.tenants
  for select using (private.is_superadmin() or id in (select private.user_tenant_ids()));
drop policy tenants_write_admin on public.tenants;
create policy tenants_write_admin on public.tenants
  for all using (private.is_superadmin()) with check (private.is_superadmin());

drop policy memberships_select_self_or_admin on public.memberships;
create policy memberships_select_self_or_admin on public.memberships
  for select using (user_id = auth.uid() or private.is_superadmin());
drop policy memberships_write_admin on public.memberships;
create policy memberships_write_admin on public.memberships
  for all using (private.is_superadmin()) with check (private.is_superadmin());

drop policy chains_select on public.retail_chains;
create policy chains_select on public.retail_chains
  for select using (private.has_tenant_access(tenant_id));
drop policy chains_insert on public.retail_chains;
create policy chains_insert on public.retail_chains
  for insert with check (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
drop policy chains_update on public.retail_chains;
create policy chains_update on public.retail_chains
  for update using (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]))
  with check (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
drop policy chains_delete on public.retail_chains;
create policy chains_delete on public.retail_chains
  for delete using (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));

drop policy stores_select on public.stores;
create policy stores_select on public.stores
  for select using (private.has_tenant_access(tenant_id));
drop policy stores_insert on public.stores;
create policy stores_insert on public.stores
  for insert with check (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
drop policy stores_update on public.stores;
create policy stores_update on public.stores
  for update using (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]))
  with check (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
drop policy stores_delete on public.stores;
create policy stores_delete on public.stores
  for delete using (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));

drop policy positions_select on public.positions;
create policy positions_select on public.positions
  for select using (private.has_tenant_access(tenant_id));
drop policy positions_insert on public.positions;
create policy positions_insert on public.positions
  for insert with check (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
drop policy positions_update on public.positions;
create policy positions_update on public.positions
  for update using (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]))
  with check (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
drop policy positions_delete on public.positions;
create policy positions_delete on public.positions
  for delete using (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));

drop policy audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select using (private.is_superadmin() or private.has_tenant_access(tenant_id));

-- ── Remover as versões públicas dos helpers (não mais referenciadas) ──────
drop function public.has_tenant_access(uuid);
drop function public.has_tenant_role(uuid, public.membership_role[]);
drop function public.user_tenant_ids();
drop function public.is_superadmin();

-- ── set_updated_at: fixar search_path ─────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── handle_new_user: remover exposição RPC (o gatilho não precisa de execute público) ─
revoke execute on function public.handle_new_user() from anon, authenticated, public;
