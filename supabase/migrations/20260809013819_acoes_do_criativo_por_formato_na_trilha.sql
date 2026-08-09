-- As ações nascidas com o criativo por formato entram na lista de conhecidas.
--
-- Sem isto elas gravam como 'acao_desconhecida' — que é a proteção funcionando
-- (a trilha não aceita ação inventada por quem chama), mas o efeito prático é
-- uma auditoria que registra 54 eventos sem dizer o que foram. Em 08/08 foram
-- exatamente os 28 envios do pack do Dia dos Pais e as 26 ligações de variante.
--
-- REGRA QUE FICA: ação nova no painel exige entrada aqui, na mesma rodada. É o
-- mesmo tipo de lista que já custou um botão que nunca funcionou (COMMANDS do
-- heartbeat) — informação em dois lugares vira buraco silencioso quando alguém
-- mexe só num deles.
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
    'enviar_video', 'vincular_variante', 'classificar_pacote'
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

-- Recupera o que já foi gravado sem nome. Não é reescrita de história: a ação
-- real está no próprio registro, em metadata->>'recusada', posta lá pela função.
-- Idempotente: rodar de novo não encontra mais nada para corrigir.
update public.audit_log
set action = metadata->>'recusada',
    metadata = jsonb_build_object(
      'recuperada_em', '2026-08-09',
      'motivo', 'acao criada em 08/08 e ausente da lista de conhecidas ate esta migration'
    )
where action = 'acao_desconhecida'
  and metadata->>'recusada' in ('enviar_video', 'vincular_variante', 'classificar_pacote');
