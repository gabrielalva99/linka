-- LINKA — trilha de auditoria de ações administrativas.
-- Escrita feita pela camada de serviço (service_role) ou por funções SECURITY DEFINER;
-- usuários comuns não inserem diretamente (não há policy de insert).

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  tenant_id uuid references public.tenants (id) on delete set null,
  action text not null,
  entity text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.audit_log is 'Trilha de auditoria de ações administrativas (quem fez o quê, em qual tenant).';
create index on public.audit_log (tenant_id, created_at desc);

alter table public.audit_log enable row level security;
create policy audit_select on public.audit_log
  for select using (public.is_superadmin() or public.has_tenant_access(tenant_id));
