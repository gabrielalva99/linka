-- Quem retirou o aparelho passa a ser dito no painel, e nao no aparelho.
--
-- Ate a 0.111.0 a tela de retirada no proprio aparelho pedia nome, cargo e loja
-- de quem estava desmontando a vitrine. Isso tinha dois problemas.
--
-- CONFORMIDADE: o aplicativo Android passava a coletar DADO PESSOAL, contra o
-- que a arquitetura promete desde o comeco, e obrigava a declarar isso na Play
-- Store para sempre. Trocar o nome por um codigo nao resolveria: na taxonomia do
-- Google, "User IDs" esta na mesma categoria de "Name", definido como
-- "identifiers that relate to an identifiable person".
--
-- FORCA DO REGISTRO: era declaratorio e ninguem conferia nada. A pessoa digitava
-- qualquer coisa numa tela de celular. O proprio codigo do agente admitia isso.
--
-- Agora quem atribui ja esta autenticado no painel, e a trilha guarda quem
-- afirmou. Sai de "alguem escreveu um nome" para "fulano, logado, disse que foi
-- o beltrano". O aparelho continua contando o FATO e a HORA, que e o ultimo
-- recado que ele consegue mandar antes de ser desinstalado.
--
-- As colunas nao mudam: retirado_por, retirado_cargo e retirado_loja continuam
-- as mesmas, so passam a ser preenchidas de outro lugar. O historico ja gravado
-- pelos aparelhos continua valendo, porque aconteceu.
create or replace function public.log_action(
  p_action text,
  p_entity text default null::text,
  p_entity_id uuid default null::uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tenant uuid;
  v_conhecida boolean;
begin
  if auth.uid() is null then return; end if;

  v_conhecida := p_action in (
    'atualizar_de_novo', 'comando', 'device.archive', 'device.unarchive',
    'devices.bulk_update', 'editar_loja', 'excluir_campanha', 'excluir_modelo',
    'excluir_posicao', 'excluir_rede', 'excluir_video', 'publicar_versao',
    'remover_app', 'renomear_modelo', 'renomear_posicao', 'renomear_rede',
    'tenant.create', 'tenant.delete', 'tenant.rename', 'tenant.reset_code',
    'tenant.activate', 'tenant.deactivate',
    'tenant.set_maintenance_pin', 'tenant.clear_maintenance_pin',
    'convidar_usuario', 'remover_acesso', 'remover_pessoa_e_conta',
    'saida_de_manutencao',
    -- Criativo por formato de tela (08/08)
    'enviar_video', 'vincular_variante', 'classificar_pacote',
    -- Quem retirou o aparelho, dito no painel (24/08)
    'identificar_retirada'
  );

  if p_entity_id is not null then
    v_tenant := case p_entity
      when 'device'      then (select tenant_id from public.devices       where id = p_entity_id)
      when 'campaign'    then (select tenant_id from public.campaigns     where id = p_entity_id)
      when 'media_asset' then (select tenant_id from public.media_assets  where id = p_entity_id)
      when 'store'       then (select tenant_id from public.stores        where id = p_entity_id)
      when 'chain'       then (select tenant_id from public.retail_chains where id = p_entity_id)
      when 'tenant'      then p_entity_id
      when 'profile'     then null
      else null
    end;
  end if;

  if v_tenant is null then
    select tenant_id into v_tenant
    from public.memberships where user_id = auth.uid() limit 1;
  end if;

  if v_tenant is not null and not private.has_tenant_access(v_tenant) then
    return;
  end if;

  insert into public.audit_log (actor_id, tenant_id, action, entity, entity_id, metadata)
  values (
    auth.uid(), v_tenant,
    case when v_conhecida then p_action else 'acao_desconhecida' end,
    p_entity, p_entity_id,
    case
      when v_conhecida then coalesce(p_metadata, '{}'::jsonb)
      else jsonb_build_object('recusada', p_action)
    end
  );
end;
$function$;
