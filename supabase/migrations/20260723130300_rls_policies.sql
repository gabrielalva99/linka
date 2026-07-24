-- LINKA — Row Level Security: isolamento por tenant.
-- Regra geral: superadmin (LINKA) vê/gere tudo; demais só enxergam os tenants a que
-- pertencem. Leitura = membros do tenant; escrita de cadastros = agência + superadmin.

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.retail_chains enable row level security;
alter table public.stores enable row level security;
alter table public.positions enable row level security;

-- ── profiles ──────────────────────────────────────────────────────────────
create policy profiles_select_self_or_admin on public.profiles
  for select using (id = auth.uid() or public.is_superadmin());
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ── tenants ───────────────────────────────────────────────────────────────
create policy tenants_select_member_or_admin on public.tenants
  for select using (public.is_superadmin() or id in (select public.user_tenant_ids()));
create policy tenants_write_admin on public.tenants
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- ── memberships ───────────────────────────────────────────────────────────
create policy memberships_select_self_or_admin on public.memberships
  for select using (user_id = auth.uid() or public.is_superadmin());
create policy memberships_write_admin on public.memberships
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- ── Cadastros tenant-scoped (redes, lojas, posições) ──────────────────────
-- Leitura: qualquer membro do tenant. Escrita: agência + superadmin.
create policy chains_select on public.retail_chains
  for select using (public.has_tenant_access(tenant_id));
create policy chains_insert on public.retail_chains
  for insert with check (public.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
create policy chains_update on public.retail_chains
  for update using (public.has_tenant_role(tenant_id, array['agency']::public.membership_role[]))
  with check (public.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
create policy chains_delete on public.retail_chains
  for delete using (public.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));

create policy stores_select on public.stores
  for select using (public.has_tenant_access(tenant_id));
create policy stores_insert on public.stores
  for insert with check (public.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
create policy stores_update on public.stores
  for update using (public.has_tenant_role(tenant_id, array['agency']::public.membership_role[]))
  with check (public.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
create policy stores_delete on public.stores
  for delete using (public.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));

create policy positions_select on public.positions
  for select using (public.has_tenant_access(tenant_id));
create policy positions_insert on public.positions
  for insert with check (public.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
create policy positions_update on public.positions
  for update using (public.has_tenant_role(tenant_id, array['agency']::public.membership_role[]))
  with check (public.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
create policy positions_delete on public.positions
  for delete using (public.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
