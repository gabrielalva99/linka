-- LINKA — o PIN de manutencao sai da tabela que o cliente le.
--
-- O ERRO. Eu guardei o PIN em tenants.maintenance_pin e disse ao Gabriel que so
-- quem opera a plataforma o veria, porque a tela de Clientes exige superadmin.
-- A tela exige; o BANCO nao exigia. A politica de leitura de tenants e
--
--   is_superadmin() OR id IN (user_tenant_ids())
--
-- ou seja, qualquer pessoa da Motorola — inclusive um usuario so de leitura —
-- podia pedir a propria linha pela API e ler o PIN da frota dela. Tela fechada
-- com coluna aberta nao e protecao, e o pior e que eu afirmei o contrario.
--
-- Nao da para resolver com privilegio de coluna: o superadmin tambem entra como
-- `authenticated`, entao revogar a coluna desse papel cegaria justamente quem
-- precisa ditar o numero por telefone.
--
-- A CORRECAO. Segredo em tabela propria, com uma politica so: superadmin. Quem
-- nao e operador da plataforma nao le nem sabe que a linha existe. A Edge
-- Function continua lendo porque usa a service role, que passa por cima do RLS.
--
-- E O OVERRIDE POR APARELHO SAI. Eu tinha criado devices.maintenance_pin para
-- "revogar um aparelho sem trocar o PIN da rede". Tinha o mesmo furo (a linha do
-- aparelho e legivel pelo cliente) e resolvia um caso que nunca apareceu — a
-- frota tem dois aparelhos e trocar o PIN do cliente ja revoga tudo. Coluna,
-- tela e regra a mais para um problema hipotetico: sai.

create table if not exists public.tenant_secrets (
  tenant_id  uuid primary key references public.tenants (id) on delete cascade,
  maintenance_pin text,
  updated_at timestamptz not null default now(),
  constraint tenant_secrets_pin_formato
    check (maintenance_pin is null or maintenance_pin ~ '^[0-9]{6,8}$')
);

comment on table public.tenant_secrets is
  'Segredos operacionais do cliente. Legivel SO pelo operador da plataforma — nunca por quem e da marca.';
comment on column public.tenant_secrets.maintenance_pin is
  'PIN que destrava a vitrine na loja (6 a 8 digitos). Nulo ou linha ausente = sem saida presencial.';

alter table public.tenant_secrets enable row level security;

drop policy if exists tenant_secrets_superadmin on public.tenant_secrets;
create policy tenant_secrets_superadmin on public.tenant_secrets
  for all to authenticated
  using (private.is_superadmin())
  with check (private.is_superadmin());

-- Leva o que ja estava gravado, para o PIN em uso nao morrer na migracao.
insert into public.tenant_secrets (tenant_id, maintenance_pin)
select id, maintenance_pin from public.tenants where maintenance_pin is not null
on conflict (tenant_id) do update set maintenance_pin = excluded.maintenance_pin;

alter table public.tenants  drop column if exists maintenance_pin;
alter table public.devices  drop column if exists maintenance_pin;
