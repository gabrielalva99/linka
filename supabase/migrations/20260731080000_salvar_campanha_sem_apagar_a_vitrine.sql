-- LINKA — salvar campanha deixa de apagar a vitrine no meio do caminho.
--
-- O QUE ESTAVA ERRADO. Salvar uma campanha eram cinco escritas separadas, cada
-- uma valendo na hora:
--
--   1. update  campaigns
--   2. delete  campaign_items      <- daqui ate a 4 a campanha tem ZERO videos
--   3. delete  campaign_targets
--   4. insert  campaign_items
--   5. insert  campaign_targets
--
-- Um aparelho que perguntasse "o que eu exibo?" entre a 2 e a 4 recebia uma lista
-- vazia e caia em "Aguardando conteudo" — vitrine apagada na loja por causa de
-- alguem corrigindo o nome de uma campanha. A janela e curta (uns 200 ms), mas com
-- 250 aparelhos batendo a cada 60s, sempre tem alguem passando por ela: a conta da
-- para um aparelho apagado a cada edicao, e o defeito reaparece "do nada", sem
-- nada no painel apontando a causa.
--
-- POR QUE ISTO VIROU URGENTE AGORA. Com o push de conteudo, o delete da linha 2
-- avisa a frota inteira NA HORA. Os 250 correriam para perguntar exatamente
-- durante a janela vazia — e o que era um aparelho virava a rede toda apagando ao
-- mesmo tempo, toda vez que alguem salvasse uma campanha. Um gatilho que so
-- acelera o sistema nao deveria criar um apagao; a corrida ja estava la, o push so
-- transformaria azar em certeza.
--
-- A CORRECAO. As cinco escritas viram UMA transacao. Ou o aparelho ve a campanha
-- inteira antiga, ou a inteira nova; o estado do meio deixa de existir para quem
-- le. Nao e otimizacao — e a diferenca entre um vazio possivel e um vazio
-- impossivel.
--
-- DE QUEBRA: cinco idas ao banco viram uma, e o push que cada uma dispararia vira
-- uma rajada de uma transacao so.

create or replace function public.salvar_campanha(
  p_campaign_id uuid,        -- nulo = campanha nova
  p_tenant_id   uuid,
  p_nome        text,
  p_starts_on   date,
  p_ends_on     date,
  p_start_time  time,
  p_end_time    time,
  p_rotation    integer,
  p_itens       jsonb,       -- [{"media_id": "...", "fit_mode": "zoom"|null}, ...] na ordem
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
begin
  -- SEM `security definer`, de proposito. Esta funcao roda como o usuario do
  -- painel, entao o RLS continua valendo linha a linha: quem nao enxerga a
  -- campanha nao a salva, e ninguem escreve no cliente do vizinho passando o
  -- tenant_id do outro. Ganhar atomicidade nao pode custar o isolamento.
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'campanha sem video nao pode ser salva';
  end if;

  if p_campaign_id is null then
    insert into public.campaigns (
      tenant_id, name, starts_on, ends_on, start_time, end_time, rotation_seconds
    ) values (
      p_tenant_id, p_nome, p_starts_on, p_ends_on, p_start_time, p_end_time, p_rotation
    ) returning id into v_id;
  else
    update public.campaigns set
      name = p_nome, starts_on = p_starts_on, ends_on = p_ends_on,
      start_time = p_start_time, end_time = p_end_time, rotation_seconds = p_rotation
    where id = p_campaign_id
    returning id into v_id;
    -- Nulo aqui e RLS barrando, nao campanha inexistente: bloqueio de UPDATE nao
    -- levanta erro, so nao afeta linha nenhuma. Sem esta checagem, salvar a
    -- campanha de outro cliente devolveria "sucesso" tendo apagado os itens.
    if v_id is null then
      raise exception 'campanha nao encontrada';
    end if;
    delete from public.campaign_items   where campaign_id = v_id;
    delete from public.campaign_targets where campaign_id = v_id;
  end if;

  insert into public.campaign_items (tenant_id, campaign_id, media_id, fit_mode, position)
  select
    p_tenant_id,
    v_id,
    (item ->> 'media_id')::uuid,
    nullif(item ->> 'fit_mode', '')::content_fit,
    ordinality
  from jsonb_array_elements(p_itens) with ordinality as t(item, ordinality);

  insert into public.campaign_targets (tenant_id, campaign_id, scope, chain_id, store_id, device_id)
  values (
    p_tenant_id, v_id, p_scope::campaign_scope,
    case when p_scope = 'chain'  then p_chain_id  end,
    case when p_scope = 'store'  then p_store_id  end,
    case when p_scope = 'device' then p_device_id end
  );

  return v_id;
end;
$function$;

comment on function public.salvar_campanha is
  'Salva campanha, videos e alvo numa transacao so. Separado, o intervalo entre apagar e regravar os videos deixava a vitrine sem nada para exibir. Ver migration 20260731080000.';

revoke all on function public.salvar_campanha from public;
grant execute on function public.salvar_campanha to authenticated;
