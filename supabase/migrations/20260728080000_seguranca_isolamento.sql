-- Três furos de isolamento entre clientes, achados numa varredura de auditoria
-- em 28/07 e confirmados no banco antes de corrigir.
--
-- ATENÇÃO ao aplicar em outro ambiente: a primeira tentativa destas correções
-- devolveu "sucesso" e não revogou nada. Duas armadilhas do Postgres:
--   1. `revoke update (coluna)` não faz nada enquanto o papel tiver `update` na
--      TABELA inteira; o privilégio de tabela engole o de coluna.
--   2. `revoke ... from anon, authenticated` não alcança o que foi concedido a
--      `public`, que é o padrão do Supabase para funções.
-- Por isso as revogações abaixo são de tabela e incluem `public`. Confira
-- depois de aplicar; não confie na mensagem de sucesso.

-- 1. Qualquer pessoa logada podia se promover a operador da plataforma.
--    A policy permite escrever na PRÓPRIA linha de profiles, e o RLS não
--    restringe COLUNA. Com a chave pública (que está dentro do APK), uma
--    chamada REST bastava para ler, apagar e desprovisionar a frota de
--    qualquer cliente. Estava dormente só porque existe um usuário e ele já é
--    o superadmin: o convite de usuários é que abriria a porta.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, email) on public.profiles to authenticated;

create or replace function private.guard_superadmin()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.is_superadmin is distinct from old.is_superadmin
     and not private.is_superadmin() then
    raise exception 'somente um operador da plataforma pode conceder esse acesso';
  end if;
  return new;
end;
$fn$;

create trigger profiles_guard_superadmin
  before update on public.profiles
  for each row execute function private.guard_superadmin();

-- 2. sync_device_alerts roda ignorando o RLS e estava chamável SEM LOGIN.
--    Devolvia nome de aparelho, nome de loja e o problema de cada aparelho de
--    todos os clientes, e ainda escrevia na tabela de alertas.
--    Quem executa é o agendador do banco, que roda como dono.
revoke execute on function public.sync_device_alerts() from public, anon, authenticated;

-- 3. O bucket de vídeos aceitava enviar e apagar de qualquer pessoa logada, de
--    qualquer cliente. O caminho já começa com o id do cliente, mas nenhuma
--    regra conferia isso: era enfeite. Um usuário do cliente A apagava a
--    campanha em vídeo do cliente B e as vitrines dele iam para tela preta.
drop policy if exists content_delete_auth on storage.objects;
drop policy if exists content_write_auth on storage.objects;

create policy content_write_tenant on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'content'
    and private.has_tenant_role((split_part(name, '/', 1))::uuid,
                                array['agency']::public.membership_role[])
  );

create policy content_delete_tenant on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'content'
    and private.has_tenant_role((split_part(name, '/', 1))::uuid,
                                array['agency']::public.membership_role[])
  );
