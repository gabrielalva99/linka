-- LINKA — cofre para segredos de servidor (a chave que envia push, para comecar).
--
-- POR QUE NAO VARIAVEL DE AMBIENTE. Seria o lugar convencional, e continua valendo
-- para o que ja esta la (SUPABASE_SERVICE_ROLE_KEY e companhia). O problema e
-- pratico: nao ha como gravar variavel de Edge Function por aqui, so pelo painel
-- do Supabase. Usar o Vault mantem o Gabriel fora do caminho — foi o que ele pediu
-- — sem baixar o padrao: o Vault e criptografado em repouso e nao aparece em dump.
--
-- POR QUE UMA FUNCAO E NAO ACESSO DIRETO. O schema `vault` nao e exposto pela API.
-- Estas duas funcoes sao a unica porta, e ela e estreita de proposito:
--   - SECURITY DEFINER, para atravessar ate o vault;
--   - EXECUTE revogado de anon e authenticated. So a service_role entra, o que
--     quer dizer: Edge Function e script de servidor, nunca o navegador.
--
-- O QUE ISSO PROTEGE. A chave da conta de servico do Firebase manda push para os
-- 250 aparelhos. Vazando, alguem troca a vitrine de uma rede inteira. Ela nao pode
-- morar no repositorio, nem no APK, nem passar por um chat.

create or replace function public.guardar_segredo(p_nome text, p_valor text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = p_nome;
  if v_id is null then
    perform vault.create_secret(p_valor, p_nome, 'LINKA');
  else
    -- Trocar a chave (rotacao, ou vazamento) nao pode exigir apagar e recriar.
    perform vault.update_secret(v_id, p_valor, p_nome, 'LINKA');
  end if;
end;
$function$;

create or replace function public.ler_segredo(p_nome text)
returns text
language sql
security definer
set search_path to 'public'
as $function$
  select decrypted_secret from vault.decrypted_secrets where name = p_nome;
$function$;

-- A porta estreita: navegador nunca, service_role sempre.
revoke execute on function public.guardar_segredo(text, text) from public, anon, authenticated;
revoke execute on function public.ler_segredo(text)           from public, anon, authenticated;
grant  execute on function public.guardar_segredo(text, text) to service_role;
grant  execute on function public.ler_segredo(text)           to service_role;

comment on function public.guardar_segredo(text, text) is
  'Grava/rotaciona segredo no Vault. So service_role. Ver migration 20260731020000.';
comment on function public.ler_segredo(text) is
  'Le segredo do Vault. So service_role — quem chama e Edge Function, nunca o navegador.';
