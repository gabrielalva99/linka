-- LINKA — video de um cliente nao entra na campanha de outro.
--
-- O FURO, provado em 29/07 com dois clientes reais. campaign_items tem chave
-- estrangeira para campaigns e para media_assets, mas NADA obrigava as duas a
-- serem do mesmo cliente. O RLS confere o `tenant_id` da propria linha — e o
-- atacante preenche esse campo com o cliente DELE, que ele legitimamente opera.
-- O `media_id` passa livre, porque conferencia de chave estrangeira e feita pelo
-- sistema e nao passa por RLS.
--
-- Medido: como agencia do cliente "Teste", criei uma campanha minha e apontei um
-- item para o video do cliente "ALVO-AUDIT". Inseriu. O aparelho do Teste
-- baixaria e exibiria aquele arquivo na vitrine — o endpoint publico do Storage
-- serve o objeto por URL.
--
-- Em producao isso e peca da Motorola aparecendo na vitrine da Claro. Nao e
-- vazamento de planilha: e a marca errada na tela, dentro da loja, na frente do
-- cliente final. O tipo de falha que encerra contrato.
--
-- A TELA JA FILTRAVA por cliente — e por isso o furo passou despercebido. Filtro
-- de tela nao e regra: e sugestao para quem usa a tela. Quem chama a API
-- diretamente (ou uma tela nossa com um bug de amanha) nao passa por ele.
--
-- POR QUE TRIGGER E NAO CHECK. Um CHECK nao pode consultar outra tabela. A regra
-- e relacional ("o dono do video tem de ser o dono da campanha"), entao vive num
-- gatilho — no banco, onde nenhuma tela consegue esquecer.

create or replace function private.conteudo_do_mesmo_cliente()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_dono_da_midia    uuid;
  v_dono_da_campanha uuid;
begin
  select tenant_id into v_dono_da_midia
    from public.media_assets where id = new.media_id;
  select tenant_id into v_dono_da_campanha
    from public.campaigns where id = new.campaign_id;

  -- Mensagem em portugues e explicita: se algum dia isto disparar em producao,
  -- quem le o log precisa entender na primeira leitura o que foi impedido.
  if v_dono_da_midia is distinct from new.tenant_id then
    raise exception
      'Vídeo de outro cliente não pode entrar nesta campanha (vídeo pertence a %, item é de %)',
      v_dono_da_midia, new.tenant_id
      using errcode = '42501';
  end if;

  if v_dono_da_campanha is distinct from new.tenant_id then
    raise exception
      'Campanha de outro cliente (campanha pertence a %, item é de %)',
      v_dono_da_campanha, new.tenant_id
      using errcode = '42501';
  end if;

  return new;
end; $fn$;

drop trigger if exists campaign_items_mesmo_cliente on public.campaign_items;
create trigger campaign_items_mesmo_cliente
  before insert or update on public.campaign_items
  for each row execute function private.conteudo_do_mesmo_cliente();

-- Mesma regra para o ALVO da campanha (loja / rede / aparelho que a recebe):
-- apontar a campanha para a loja de outro cliente tem o mesmo efeito pratico.
create or replace function private.alvo_do_mesmo_cliente()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_dono uuid;
begin
  select tenant_id into v_dono from public.campaigns where id = new.campaign_id;
  if v_dono is distinct from new.tenant_id then
    raise exception 'Campanha de outro cliente (campanha pertence a %, alvo é de %)',
      v_dono, new.tenant_id using errcode = '42501';
  end if;

  if new.store_id is not null then
    select tenant_id into v_dono from public.stores where id = new.store_id;
    if v_dono is distinct from new.tenant_id then
      raise exception 'Loja de outro cliente não pode ser alvo desta campanha'
        using errcode = '42501';
    end if;
  end if;

  if new.chain_id is not null then
    select tenant_id into v_dono from public.retail_chains where id = new.chain_id;
    if v_dono is distinct from new.tenant_id then
      raise exception 'Rede de outro cliente não pode ser alvo desta campanha'
        using errcode = '42501';
    end if;
  end if;

  if new.device_id is not null then
    select tenant_id into v_dono from public.devices where id = new.device_id;
    if v_dono is distinct from new.tenant_id then
      raise exception 'Aparelho de outro cliente não pode ser alvo desta campanha'
        using errcode = '42501';
    end if;
  end if;

  return new;
end; $fn$;

drop trigger if exists campaign_targets_mesmo_cliente on public.campaign_targets;
create trigger campaign_targets_mesmo_cliente
  before insert or update on public.campaign_targets
  for each row execute function private.alvo_do_mesmo_cliente();

-- E o video fixo no aparelho, que e o outro caminho para a vitrine.
create or replace function private.conteudo_fixo_do_mesmo_cliente()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_dono uuid;
begin
  if new.content_url is null then return new; end if;
  -- Só valida quando a URL corresponde a um vídeo cadastrado. URL avulsa
  -- (teste, link externo) continua permitida — bloquear isso agora quebraria
  -- fluxo em uso sem fechar furo nenhum: o que vaza é o arquivo DE OUTRO
  -- cliente, e esse tem registro na biblioteca.
  select tenant_id into v_dono
    from public.media_assets where url = new.content_url limit 1;
  if v_dono is not null and v_dono is distinct from new.tenant_id then
    raise exception 'Este vídeo pertence a outro cliente e não pode ser fixado neste aparelho'
      using errcode = '42501';
  end if;
  return new;
end; $fn$;

drop trigger if exists devices_conteudo_mesmo_cliente on public.devices;
create trigger devices_conteudo_mesmo_cliente
  before insert or update of content_url on public.devices
  for each row execute function private.conteudo_fixo_do_mesmo_cliente();
