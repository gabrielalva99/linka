-- A tabela de auditoria existe desde 23/07, tem política de leitura e índice, e
-- NUNCA recebeu um registro: nada no código escrevia nela. Descoberto numa
-- varredura em 28/07.
--
-- O problema não era a tabela, era o caminho de escrita: não existe policy de
-- insert (de propósito, ninguém deve poder forjar um registro), e o painel
-- escreve como o próprio usuário. Sem uma função com privilégio, a auditoria
-- ficou desligada sem ninguém saber.
--
-- Com 250 aparelhos de um cliente externo, isto é o que falta na hora em que
-- algo dá errado: quem desprovisionou aquele aparelho, quem apagou aquela loja,
-- quem publicou aquela versão.
--
-- O cliente vem do ALVO da ação, e o vínculo do autor é só o segundo caminho:
-- o operador da plataforma não tem vínculo com cliente nenhum (superadmin é uma
-- marca no perfil, não uma associação), e como hoje o único usuário é
-- exatamente esse, todo registro nasceria sem cliente.
--
-- O autor NUNCA é parâmetro. Vem da sessão. Registro em que o chamador escolhe
-- quem assina não serve de prova.
create function public.log_action(
  p_action text,
  p_entity text default null,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tenant uuid;
begin
  if auth.uid() is null then return; end if;

  if p_entity_id is not null then
    v_tenant := case p_entity
      when 'device'      then (select tenant_id from public.devices       where id = p_entity_id)
      when 'campaign'    then (select tenant_id from public.campaigns     where id = p_entity_id)
      when 'media_asset' then (select tenant_id from public.media_assets  where id = p_entity_id)
      when 'store'       then (select tenant_id from public.stores        where id = p_entity_id)
      when 'chain'       then (select tenant_id from public.retail_chains where id = p_entity_id)
      else null
    end;
  end if;

  if v_tenant is null then
    select tenant_id into v_tenant
    from public.memberships where user_id = auth.uid() limit 1;
  end if;

  insert into public.audit_log (actor_id, tenant_id, action, entity, entity_id, metadata)
  values (auth.uid(), v_tenant, p_action, p_entity, p_entity_id,
          coalesce(p_metadata, '{}'::jsonb));
end;
$fn$;

comment on function public.log_action is 'Registra uma ação administrativa. O autor vem da sessão, nunca de parâmetro.';

-- Só quem está logado registra. Anônimo não tem o que auditar.
revoke execute on function public.log_action(text, text, uuid, jsonb) from public, anon;
grant execute on function public.log_action(text, text, uuid, jsonb) to authenticated;
