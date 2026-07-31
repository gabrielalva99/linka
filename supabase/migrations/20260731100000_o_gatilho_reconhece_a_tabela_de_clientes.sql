-- LINKA — o gatilho de conteudo passa a reconhecer a tabela de clientes.
--
-- DOIS FUROS QUE EU MESMO ABRI, achados relendo o que escrevi hoje antes de
-- publicar. A migration anterior pendurou o gatilho em `tenants` para mudar o
-- ritmo da batida avisar a frota na hora. So que a funcao nao sabia o que fazer
-- com essa tabela:
--
--   1. `tenants` nao estava na lista de colunas vigiadas, entao a funcao saia
--      pelo `chaves is null` e nao avisava ninguem;
--   2. mesmo corrigindo (1), o alvo sairia de `tenant_id` — coluna que nao
--      existe em `tenants`, porque ali o cliente E a propria linha. O aviso iria
--      com alvo nulo e a funcao de push o recusaria com "sem_alvo".
--
-- Os dois falham do mesmo jeito: em silencio. Ninguem toma erro, nada aparece no
-- painel, e o sintoma seria "mudei o ritmo e os aparelhos continuaram no antigo"
-- — descoberto semanas depois, provavelmente pela conta que nao caiu.
--
-- Vale a licao para a proxima tabela: pendurar o gatilho e METADE do trabalho. A
-- outra metade e ensinar a funcao quais colunas importam e de onde sai o alvo.

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
    -- O ritmo da batida: o aparelho recebe este numero junto com o conteudo, e
    -- mudar de 60s para 5 min so vale a pena se chegar na hora.
    when 'tenants'          then array['heartbeat_seconds']
    else null
  end;
  if chaves is null then return null; end if;

  if tg_op = 'UPDATE' and (
    select coalesce(bool_and(atual -> k is not distinct from anterior -> k), true)
      from unnest(chaves) as k
  ) then
    return null;
  end if;

  corpo := case tg_table_name
    when 'devices' then jsonb_build_object('device_id', atual ->> 'id')
    when 'stores'  then jsonb_build_object('store_id',  atual ->> 'id')
    -- Aqui a linha E o cliente: o alvo sai de `id`. Usar `tenant_id`, como nas
    -- outras, mandaria alvo nulo e o aviso seria recusado.
    when 'tenants' then jsonb_build_object('tenant_id', atual ->> 'id')
    else                jsonb_build_object('tenant_id', atual ->> 'tenant_id')
  end;

  if tg_table_name = 'devices' and atual ->> 'push_token' is null then
    return null;
  end if;

  -- O 'p' antes do hash: nome de parametro nao comeca com digito, e md5 comeca
  -- com digito em dez dos dezesseis casos.
  marca := 'linka.p' || md5(corpo::text);
  if current_setting(marca, true) = '1' then return null; end if;
  perform set_config(marca, '1', true);

  perform net.http_post(
    url := 'https://xkzktmsqtvpkxmzftars.supabase.co/functions/v1/agent-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-linka-guarda', public.ler_segredo('push_guarda')
    ),
    body := corpo || jsonb_build_object('motivo', 'conteudo:' || tg_table_name)
  );
  return null;
end;
$function$;
