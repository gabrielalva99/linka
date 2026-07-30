-- LINKA — a trilha de auditoria para de aceitar fato inventado.
--
-- O ACHADO. `log_action` e SECURITY DEFINER e chamavel por qualquer usuario
-- logado via /rest/v1/rpc/log_action. Medido: com a sessao de uma agencia, gravei
--
--     action = 'cliente_aprovou_a_campanha_INVENTADO'
--
-- um evento que nunca aconteceu. O autor continua sendo quem chamou (auth.uid()
-- nao e forjavel) e o cliente ja foi travado na migration 20260730000000 — entao
-- ninguem incrimina outra pessoa nem escreve na casa alheia. Mas da para INVENTAR
-- FATO na propria trilha, e trilha que aceita ficcao nao serve como prova. Num
-- piloto com marca grande, a auditoria e o documento que o procurement pede.
--
-- POR QUE NAO SIMPLESMENTE REVOGAR O EXECUTE. Porque quem chama e o painel, com a
-- sessao da pessoa — revogar apagaria a auditoria inteira. Mover a escrita para
-- uma chave de servico dentro do site resolveria, mas poe uma chave que ignora
-- todo o RLS dentro da aplicacao web para ganhar pouco: o autor ja e confiavel.
--
-- A TRAVA ESCOLHIDA: lista do que o produto realmente emite. Nao impede alguem de
-- repetir uma acao verdadeira (isso vira ruido, nao mentira), mas impede inventar
-- um acontecimento que o sistema nunca teve. E o limite honesto do que da para
-- garantir sem trocar a arquitetura.
--
-- MANUTENCAO: acao nova no painel exige entrada nova aqui. Se esquecerem, o
-- registro some em silencio — entao a funcao devolve o texto 'acao_desconhecida'
-- no metadata em vez de sumir, para o esquecimento aparecer na propria trilha em
-- vez de virar um buraco invisivel.

create or replace function public.log_action(
  p_action text,
  p_entity text default null,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_tenant uuid;
  v_conhecida boolean;
begin
  if auth.uid() is null then return; end if;

  v_conhecida := p_action in (
    -- Painel
    'atualizar_de_novo', 'comando', 'device.archive', 'device.unarchive',
    'devices.bulk_update', 'editar_loja', 'excluir_campanha', 'excluir_modelo',
    'excluir_posicao', 'excluir_rede', 'excluir_video', 'publicar_versao',
    'remover_app', 'renomear_modelo', 'renomear_posicao', 'renomear_rede',
    'tenant.create', 'tenant.delete', 'tenant.rename', 'tenant.reset_code',
    'tenant.activate', 'tenant.deactivate',
    'tenant.set_maintenance_pin', 'tenant.clear_maintenance_pin',
    -- Edge Functions
    'convidar_usuario', 'remover_acesso', 'remover_pessoa_e_conta',
    -- Agente
    'saida_de_manutencao'
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

  -- O cliente do registro tem de ser um que o autor alcanca (migration
  -- 20260730000000): sem isto da para escrever na auditoria de outro cliente.
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
      -- Guarda o que tentaram gravar. Serve para os dois casos: alguem inventando,
      -- e a gente esquecendo de cadastrar uma acao nova do produto.
      else jsonb_build_object('recusada', p_action)
    end
  );
end;
$function$;

comment on function public.log_action(text, text, uuid, jsonb) is
  'Grava a trilha de auditoria. Autor de auth.uid(), cliente conferido, e acao precisa estar na lista conhecida — acao fora da lista vira acao_desconhecida com o texto original no metadata. Ver migration 20260730050000.';
