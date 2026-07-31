-- LINKA - salvar campanha grava os videos no cliente DA CAMPANHA, nao no do seletor.
--
-- Achado revisando a propria funcao na varredura de 31/07, antes de acontecer.
--
-- O CENARIO. Quem opera a plataforma enxerga todos os clientes e escolhe um no
-- seletor. Ao EDITAR, a funcao recebia o tenant do seletor e carimbava os videos
-- e o alvo com ele. Com uma aba antiga aberta (editar a campanha da Motorola,
-- trocar o seletor para outra marca, voltar na aba e salvar), a campanha
-- continuava da Motorola - o UPDATE nao mexe em tenant_id - mas os videos e o
-- alvo entravam no OUTRO cliente.
--
-- O ESTRAGO SERIA DOS SILENCIOSOS. O RLS filtra os videos por cliente, entao o
-- painel da Motorola mostraria a campanha SEM NENHUM video; ja o aparelho
-- continuaria tocando normalmente, porque a resolucao de conteudo roda no
-- servidor, que enxerga tudo. Painel dizendo uma coisa e vitrine fazendo outra
-- e o tipo de defeito que faz alguem "consertar" o que nao esta quebrado.
--
-- A CORRECAO. O cliente dos videos sai da PROPRIA campanha (returning), nao do
-- parametro. Para o usuario de marca nada muda: o RLS ja garantia que ele so
-- alcanca campanha do proprio cliente. Isto protege quem pode demais - a
-- operacao da plataforma.

create or replace function public.salvar_campanha(
  p_campaign_id uuid,
  p_tenant_id   uuid,
  p_nome        text,
  p_starts_on   date,
  p_ends_on     date,
  p_start_time  time,
  p_end_time    time,
  p_rotation    integer,
  p_itens       jsonb,
  p_scope       text,
  p_chain_id    uuid,
  p_store_id    uuid,
  p_device_id   uuid
) returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_tenant uuid;
begin
  -- Sem `security definer`, de proposito: roda como o usuario do painel e o RLS
  -- continua valendo linha a linha. Ver migration 20260731080000.
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'campanha sem video nao pode ser salva';
  end if;

  if p_campaign_id is null then
    insert into public.campaigns (
      tenant_id, name, starts_on, ends_on, start_time, end_time, rotation_seconds
    ) values (
      p_tenant_id, p_nome, p_starts_on, p_ends_on, p_start_time, p_end_time, p_rotation
    ) returning id, tenant_id into v_id, v_tenant;
  else
    update public.campaigns set
      name = p_nome, starts_on = p_starts_on, ends_on = p_ends_on,
      start_time = p_start_time, end_time = p_end_time, rotation_seconds = p_rotation
    where id = p_campaign_id
    returning id, tenant_id into v_id, v_tenant;
    -- Nulo aqui e RLS barrando: bloqueio de UPDATE nao levanta erro, so nao
    -- afeta linha nenhuma. Sem isto, salvar a campanha de outro cliente
    -- devolveria "sucesso" tendo apagado os itens.
    if v_id is null then
      raise exception 'campanha nao encontrada';
    end if;
    delete from public.campaign_items   where campaign_id = v_id;
    delete from public.campaign_targets where campaign_id = v_id;
  end if;

  insert into public.campaign_items (tenant_id, campaign_id, media_id, fit_mode, position)
  select
    v_tenant,
    v_id,
    (item ->> 'media_id')::uuid,
    nullif(item ->> 'fit_mode', '')::content_fit,
    ordinality
  from jsonb_array_elements(p_itens) with ordinality as t(item, ordinality);

  insert into public.campaign_targets (tenant_id, campaign_id, scope, chain_id, store_id, device_id)
  values (
    v_tenant, v_id, p_scope::campaign_scope,
    case when p_scope = 'chain'  then p_chain_id  end,
    case when p_scope = 'store'  then p_store_id  end,
    case when p_scope = 'device' then p_device_id end
  );

  return v_id;
end;
$function$;
