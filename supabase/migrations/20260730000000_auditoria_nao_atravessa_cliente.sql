-- LINKA — a trilha de auditoria para de atravessar a parede entre clientes.
--
-- O FURO, provado em 29/07 com dois clientes reais. log_action deriva o cliente
-- do registro a partir do `p_entity_id` que QUEM CHAMA escolhe:
--
--   v_tenant := case p_entity when 'device' then (select tenant_id from devices
--                                                 where id = p_entity_id) ... end
--
-- Sem conferir se quem chama tem acesso a esse cliente. Resultado medido: como
-- agencia do cliente "Teste", passando o id de um aparelho do cliente
-- "ALVO-AUDIT", o registro foi gravado na auditoria do ALVO-AUDIT.
--
-- POR QUE ISSO IMPORTA MAIS DO QUE PARECE. A auditoria e a tabela que responde
-- "quem fez o que" quando algo da errado — e num piloto com marca grande, ela e
-- o documento que o procurement vai pedir. Trilha em que um terceiro consegue
-- escrever nao prova nada: qualquer registro passa a ser contestavel ("nao fui
-- eu, alguem plantou"). Pior: da para plantar acao em nome do proprio dono da
-- conta atacada, porque o autor gravado e quem chamou, mas o CLIENTE gravado e o
-- da vitima, e nas telas o registro aparece dentro da casa dela.
--
-- O `actor_id` nunca foi forjavel (sempre saiu de auth.uid()), e isso continua.
-- O que faltava era a outra metade: o cliente do registro tambem tem de ser um
-- que o autor alcanca.
--
-- A CORRECAO. Depois de derivar o cliente, exigir acesso a ele. Sem acesso, o
-- registro NAO e gravado — e nao "cai no proprio cliente" como consolo, porque
-- registro no lugar errado e pior do que registro nenhum: viraria um evento que
-- ninguem consegue explicar na auditoria de quem nao fez nada.
--
-- Continua sem lancar excecao: auditoria que derruba a acao auditada faz o
-- operador parar de trabalhar por causa do diario de bordo.

create or replace function public.log_action(
  p_action text,
  p_entity text default null,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path to 'public' as $function$
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
      when 'tenant'      then p_entity_id
      when 'profile'     then null
      else null
    end;
  end if;

  if v_tenant is null then
    select tenant_id into v_tenant
    from public.memberships where user_id = auth.uid() limit 1;
  end if;

  -- A TRAVA. O cliente do registro tem de ser um que o autor alcanca.
  --
  -- Superadmin passa (private.has_tenant_access ja trata isso), porque quem opera
  -- a plataforma age legitimamente em qualquer cliente — e as acoes dele PRECISAM
  -- ficar registradas na casa certa.
  if v_tenant is not null and not private.has_tenant_access(v_tenant) then
    return;
  end if;

  insert into public.audit_log (actor_id, tenant_id, action, entity, entity_id, metadata)
  values (auth.uid(), v_tenant, p_action, p_entity, p_entity_id,
          coalesce(p_metadata, '{}'::jsonb));
end;
$function$;

comment on function public.log_action(text, text, uuid, jsonb) is
  'Grava a trilha de auditoria. O autor sai de auth.uid() e o cliente e conferido: sem acesso ao cliente derivado, o registro e descartado (ver migration 20260730000000).';
