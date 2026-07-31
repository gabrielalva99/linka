-- LINKA — o push passa a cobrir conteudo, e nao so comando.
--
-- POR QUE ISTO EXISTE. Sobrou UM caminho periodico: o heartbeat de 60 em 60
-- segundos, que responde por ~1,0 das ~1,1 chamadas/min/aparelho. Ele carrega
-- duas coisas ao mesmo tempo:
--
--   1. comando pendente        -> ja resolvido pelo push (chega em ~2s)
--   2. "o conteudo mudou?"     -> ainda so pelo heartbeat
--
-- Enquanto (2) depender do heartbeat, ele nao pode ficar lento: trocar a campanha
-- e esperar cinco minutos para a vitrine virar e ruim de vender. Com este arquivo
-- os dois passam pelo push, e o heartbeat vira o que ele sempre foi de verdade —
-- o "esta loja esta no ar?" — que aguenta ser lento porque ninguem espera na
-- frente dele.
--
-- O QUE O PUSH MANDA CONTINUA SENDO NADA. Nenhum conteudo viaja: a mensagem e
-- sempre "fale comigo agora". Push perdido nao deixa a vitrine com campanha
-- velha, porque quem entrega de verdade continua sendo a batida. O push so
-- antecipa a proxima.
--
-- ERRAR PARA MAIS E BARATO, ERRAR PARA MENOS E CARO. Se um gatilho daqui acorda
-- um aparelho a toa, ele bate, o servidor responde "nao mudou" e acabou — custo
-- de uma chamada. Se um gatilho DEIXA de disparar, a vitrine fica com conteudo
-- velho ate a proxima batida — e depois que ela ficar lenta, isso e visivel. Por
-- isso as listas de colunas abaixo sao generosas, e o alvo de campanha e o
-- cliente inteiro em vez do conjunto exato de aparelhos atingidos.

-- ---------------------------------------------------------------------------
-- O gatilho, um so para todas as tabelas que mexem na vitrine.
-- ---------------------------------------------------------------------------
--
-- UM SO DE PROPOSITO. O endereco da funcao e a guarda do cofre aparecem uma vez.
-- Sete copias quase iguais e sete lugares para alguem corrigir metade no dia em
-- que o endereco mudar — a mesma armadilha que o builder de conteudo compartilhado
-- existe para evitar.
create or replace function private.acordar_por_conteudo()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  atual     jsonb;
  anterior  jsonb;
  chaves    text[];
  corpo     jsonb;
  marca     text;
begin
  atual    := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  anterior := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;

  -- As colunas que realmente chegam ao aparelho. Sao as mesmas que montarConteudo
  -- le em _shared/conteudo.ts e que resolve_device_content consulta; coluna que so
  -- serve ao painel (nome da campanha, observacao da loja) fica de fora porque
  -- acordar 250 aparelhos para corrigir um acento e desperdicio puro.
  chaves := case tg_table_name
    when 'devices' then array[
      'content_url','content_fit','idle_return_seconds','volume_percent',
      'block_settings','cleanup_enabled','cleanup_time','store_id'
    ]
    when 'stores' then array['opens_at','closes_at','timezone','chain_id']
    when 'campaigns' then array[
      'is_active','starts_on','ends_on','start_time','end_time','rotation_seconds'
    ]
    when 'campaign_items'   then array['campaign_id','media_id','position','fit_mode']
    when 'campaign_targets' then array['campaign_id','scope','chain_id','store_id','device_id']
    when 'media_assets'     then array['url','fit_mode']
    when 'tenant_secrets'   then array['maintenance_pin']
    else null
  end;
  if chaves is null then return null; end if;

  -- Salvar sem mudar nada nao acorda ninguem.
  --
  -- O `after update of <colunas>` do Postgres dispara quando a coluna esta no SET,
  -- mesmo com o mesmo valor — e formulario de painel costuma reenviar o registro
  -- inteiro. Sem esta comparacao, abrir a tela da campanha e clicar em salvar
  -- acordaria a frota toda por nada.
  if tg_op = 'UPDATE' and (
    select coalesce(bool_and(atual -> k is not distinct from anterior -> k), true)
      from unnest(chaves) as k
  ) then
    return null;
  end if;

  -- O alvo, do mais estreito para o mais largo.
  --
  -- Campanha, item, midia e PIN acordam o CLIENTE INTEIRO, e nao so os aparelhos
  -- que a campanha mira. E de proposito: desligar uma campanha promove outra, e
  -- calcular exatamente quem herda o que exigiria repetir aqui, em SQL, a
  -- precedencia que ja mora em resolve_device_content. Duas copias da mesma regra
  -- e como se perde uma delas. O preco de errar para mais e o aparelho bater uma
  -- vez e ouvir "nao mudou". Com os 250 do piloto isso e ruido; se um dia a
  -- frota crescer a ponto de incomodar, estreitar e trocar este `else`.
  corpo := case tg_table_name
    when 'devices' then jsonb_build_object('device_id', atual ->> 'id')
    when 'stores'  then jsonb_build_object('store_id',  atual ->> 'id')
    else                jsonb_build_object('tenant_id', atual ->> 'tenant_id')
  end;

  -- Aparelho sem endereco no FCM nao tem por onde ser chamado: ele continua sendo
  -- atendido pela batida, e a chamada seria gasta para nada.
  if tg_table_name = 'devices' and atual ->> 'push_token' is null then
    return null;
  end if;

  -- UM AVISO POR ALVO, POR TRANSACAO.
  --
  -- Salvar uma campanha de tres videos sao NOVE escritas nas tabelas acima
  -- (a campanha, tres videos apagados, o alvo apagado, tres regravados, o alvo
  -- regravado). Sem esta trava, sairiam nove avisos identicos, cada um mandando
  -- os 250 aparelhos falarem com o servidor: 2.250 conversas para comunicar uma
  -- unica troca de campanha.
  --
  -- `set_config(..., true)` vale so ate o fim da transacao e some sozinho — sem
  -- tabela de controle, sem limpeza, sem estado sobrando entre uma edicao e a
  -- seguinte. E funciona justamente porque salvar campanha virou uma transacao
  -- so (migration 20260731080000): as nove escritas agora se enxergam.
  -- O 'p' antes do hash nao e enfeite. O Postgres exige que o nome depois do
  -- ponto seja um identificador, e identificador nao comeca com digito — e md5
  -- comeca com digito em dez dos dezesseis casos. Sem a letra, salvar quebrava
  -- com erro de banco na cara de quem clicou, para uns clientes sim e outros
  -- nao, dependendo do sorteio do hash. Achado no teste, nao na loja.
  marca := 'linka.p' || md5(corpo::text);
  if current_setting(marca, true) = '1' then return null; end if;
  perform set_config(marca, '1', true);

  -- Assincrono: quem salvou a campanha no painel nao pode ficar esperando o
  -- Google responder. Push que falha nao quebra nada — a batida entrega igual.
  perform net.http_post(
    url := 'https://xkzktmsqtvpkxmzftars.supabase.co/functions/v1/agent-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-linka-guarda', public.ler_segredo('push_guarda')
    ),
    body := corpo || jsonb_build_object('motivo', 'conteudo:' || tg_table_name)
  );
  return null;  -- AFTER trigger: o retorno e ignorado
end;
$function$;

comment on function private.acordar_por_conteudo() is
  'Avisa por push quando muda algo que o aparelho exibe. Gatilho no banco para nenhum escritor futuro escapar. Ver migration 20260731070000.';

-- ---------------------------------------------------------------------------
-- Onde ele fica pendurado.
-- ---------------------------------------------------------------------------
--
-- `after ... of <colunas>` em devices e obrigatorio, nao e refinamento: o
-- heartbeat escreve nessa tabela a cada batida de cada aparelho. Um gatilho sem
-- lista de colunas seria avaliado ~250 vezes por minuto para sempre, e um erro de
-- logica ali viraria push por batida — a frota acordando a si mesma em circulo.
drop trigger if exists devices_acordar_por_conteudo on public.devices;
create trigger devices_acordar_por_conteudo
  after update of
    content_url, content_fit, idle_return_seconds, volume_percent,
    block_settings, cleanup_enabled, cleanup_time, store_id
  on public.devices
  for each row execute function private.acordar_por_conteudo();

drop trigger if exists stores_acordar_por_conteudo on public.stores;
create trigger stores_acordar_por_conteudo
  after update of opens_at, closes_at, timezone, chain_id
  on public.stores
  for each row execute function private.acordar_por_conteudo();

-- Campanha: INSERT tambem, porque campanha nova ja nasce podendo ganhar da atual.
drop trigger if exists campaigns_acordar_por_conteudo on public.campaigns;
create trigger campaigns_acordar_por_conteudo
  after insert or delete or update of
    is_active, starts_on, ends_on, start_time, end_time, rotation_seconds
  on public.campaigns
  for each row execute function private.acordar_por_conteudo();

drop trigger if exists campaign_items_acordar_por_conteudo on public.campaign_items;
create trigger campaign_items_acordar_por_conteudo
  after insert or delete or update on public.campaign_items
  for each row execute function private.acordar_por_conteudo();

drop trigger if exists campaign_targets_acordar_por_conteudo on public.campaign_targets;
create trigger campaign_targets_acordar_por_conteudo
  after insert or delete or update on public.campaign_targets
  for each row execute function private.acordar_por_conteudo();

drop trigger if exists media_assets_acordar_por_conteudo on public.media_assets;
create trigger media_assets_acordar_por_conteudo
  after delete or update of url, fit_mode
  on public.media_assets
  for each row execute function private.acordar_por_conteudo();

-- Midia recem-enviada ainda nao esta em campanha nenhuma: nada mudou na vitrine
-- e acordar a frota seria gasto puro. Quem acorda e o item de campanha, logo
-- depois. Por isso este nao tem INSERT.

drop trigger if exists tenant_secrets_acordar_por_conteudo on public.tenant_secrets;
create trigger tenant_secrets_acordar_por_conteudo
  after insert or update of maintenance_pin
  on public.tenant_secrets
  for each row execute function private.acordar_por_conteudo();

-- ---------------------------------------------------------------------------
-- O que ficou DE FORA, e por que.
-- ---------------------------------------------------------------------------
--
-- agent_releases (versao publicada do app). Ela entra na resposta de conteudo, e
-- portanto na impressao digital — publicar um APK novo ja avisa os aparelhos na
-- proxima batida, sem push nenhum. Deixar de fora e de proposito: com push, os
-- 250 baixariam o mesmo arquivo de ~15 MB no mesmo segundo, e ate dezessete deles
-- dividem o wi-fi de uma loja so. Sem push, o download se espalha pela janela da
-- batida sozinho. Atualizacao de app nao e urgente; campanha e.
