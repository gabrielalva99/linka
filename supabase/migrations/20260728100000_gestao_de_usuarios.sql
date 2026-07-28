-- Quem convida: o operador da plataforma e a equipe da agência, esta última só
-- para clientes que já atende. Decisão do Gabriel em 28/07.
--
-- A agência concede apenas os papéis de LEITURA (client e field). Promover
-- alguém a agência continua sendo do operador da plataforma: senão qualquer
-- pessoa da agência amplia o próprio time sem ninguém saber, e o convite vira
-- um caminho de escalada de acesso.
--
-- Aplicar SEMPRE depois de 20260728080000: a tela de usuários é justamente o
-- que ativa o furo fechado lá (qualquer logado virava operador da plataforma).

-- Para montar a tela de usuários é preciso ver quem mais está no mesmo cliente.
-- A regra antiga só deixava ver a si mesmo, então a lista nasceria com uma linha.
drop policy if exists memberships_select_self_or_admin on public.memberships;
create policy memberships_select on public.memberships
  for select using (
    user_id = auth.uid()
    or private.is_superadmin()
    or private.has_tenant_access(tenant_id)
  );

drop policy if exists memberships_write_admin on public.memberships;

create policy memberships_admin_all on public.memberships
  for all using (private.is_superadmin()) with check (private.is_superadmin());

create policy memberships_agency_insert on public.memberships
  for insert to authenticated
  with check (
    private.has_tenant_role(tenant_id, array['agency']::public.membership_role[])
    and role in ('client', 'field')
  );

create policy memberships_agency_update on public.memberships
  for update to authenticated
  using (
    private.has_tenant_role(tenant_id, array['agency']::public.membership_role[])
    and role in ('client', 'field')
  )
  with check (
    private.has_tenant_role(tenant_id, array['agency']::public.membership_role[])
    and role in ('client', 'field')
  );

create policy memberships_agency_delete on public.memberships
  for delete to authenticated
  using (
    private.has_tenant_role(tenant_id, array['agency']::public.membership_role[])
    and role in ('client', 'field')
  );

-- A tela de usuários mostra nome e e-mail de quem tem acesso ao mesmo cliente.
-- Sem isto a lista sairia como uma coluna de identificadores sem sentido.
drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or private.is_superadmin()
    or exists (
      select 1 from public.memberships m
      where m.user_id = profiles.id
        and private.has_tenant_access(m.tenant_id)
    )
  );
