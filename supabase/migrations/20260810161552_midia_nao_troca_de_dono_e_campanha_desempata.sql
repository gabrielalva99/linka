-- 1. O DONO DE UMA MÍDIA NÃO MUDA. NUNCA.
--
-- Provado na varredura de 09/08: um usuário com papel de agência em DOIS clientes
-- (que é o caso da operação, atendendo várias marcas) movia uma peça de um
-- cliente para o outro com um único UPDATE. As variantes iam junto pela chave
-- estrangeira, e o aparelho da vítima passava a receber a peça do outro cliente.
--
-- Os gatilhos de variante e o `conteudo_do_mesmo_cliente` de 29/07 olham a linha
-- FILHA no momento em que ela é escrita. Nenhum deles é acordado quando o DONO da
-- peça principal muda — ela sai pela porta do `if new.variant_of is null` antes
-- de qualquer checagem.
--
-- Dava para remendar caso a caso. Mas cada vínculo novo que apontar para
-- `media_assets` reabriria o buraco, e o de hoje nasceu exatamente assim. Trocar
-- o dono de um arquivo já enviado não é operação que o produto ofereça em lugar
-- nenhum: fechar a operação inteira custa menos que lembrar de proteger cada
-- vínculo futuro.
create or replace function private.midia_nao_troca_de_dono()
returns trigger
language plpgsql
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception
      'O cliente dono de um arquivo não pode ser alterado. Envie o arquivo no cliente correto.';
  end if;
  return new;
end;
$$;

drop trigger if exists media_assets_dono_imutavel on media_assets;
create trigger media_assets_dono_imutavel
  before update of tenant_id on media_assets
  for each row execute function private.midia_nao_troca_de_dono();

-- 2. CAMPANHA EMPATADA DEIXA DE SER SORTEIO.
--
-- `resolve_device_content` ordenava por (especificidade do alvo, updated_at) e
-- pegava a primeira. Duas campanhas ativas do mesmo escopo com o MESMO
-- updated_at — criadas em lote, por script, ou por dois cliques no mesmo
-- instante — empatam, e aí a ordem é indefinida.
--
-- Isso não é só "campanha errada no ar". A escolha entra na playlist, que entra
-- no hash da revisão: o heartbeat passaria a dizer "mudou" a cada batida e o
-- aparelho baixaria o mesmo vídeo para sempre. É o mesmo defeito que a ordenação
-- das variantes tinha, num lugar onde ninguém tinha olhado.
create or replace function public.resolve_device_content(p_device_id uuid)
returns table(out_url text, out_fit content_fit, out_source text, out_campaign_id uuid, out_campaign_name text)
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  dev record; loc timestamp; camp record; item record; total integer; idx integer;
begin
  select d.id, d.tenant_id, d.store_id, d.content_url, d.content_fit,
         s.chain_id, coalesce(s.timezone, 'America/Sao_Paulo') as tz
    into dev
    from public.devices d
    left join public.stores s on s.id = d.store_id
   where d.id = p_device_id;
  if not found then return; end if;

  if dev.content_url is not null then
    out_url := dev.content_url;
    out_fit := coalesce(
      dev.content_fit,
      (select m.fit_mode from public.media_assets m where m.url = dev.content_url limit 1),
      'zoom'
    );
    out_source := 'device';
    return next;
    return;
  end if;

  loc := now() at time zone dev.tz;

  select c.id, c.name, c.rotation_seconds, t.scope
    into camp
    from public.campaigns c
    join public.campaign_targets t on t.campaign_id = c.id
   where c.tenant_id = dev.tenant_id
     and c.is_active
     and (c.starts_on is null or c.starts_on <= loc::date)
     and (c.ends_on is null or c.ends_on >= loc::date)
     and (
       c.start_time is null or c.end_time is null
       or (c.start_time <= c.end_time and loc::time between c.start_time and c.end_time)
       or (c.start_time > c.end_time and (loc::time >= c.start_time or loc::time <= c.end_time))
     )
     and (
       t.scope = 'tenant'
       or (t.scope = 'chain' and t.chain_id = dev.chain_id)
       or (t.scope = 'store' and t.store_id = dev.store_id)
       or (t.scope = 'device' and t.device_id = dev.id)
     )
   order by case t.scope
              when 'device' then 4 when 'store' then 3 when 'chain' then 2 else 1
            end desc,
            c.updated_at desc,
            c.id desc
   limit 1;
  if not found then return; end if;

  select count(*) into total from public.campaign_items where campaign_id = camp.id;
  if total = 0 then return; end if;

  idx := (floor(extract(epoch from now()) / camp.rotation_seconds)::bigint % total)::integer;

  select ci.media_id, ci.fit_mode
    into item
    from public.campaign_items ci
   where ci.campaign_id = camp.id
   order by ci.position, ci.id
   offset idx limit 1;
  if not found then return; end if;

  select m.url, coalesce(dev.content_fit, item.fit_mode, m.fit_mode, 'zoom')
    into out_url, out_fit
    from public.media_assets m
   where m.id = item.media_id;
  if out_url is null then return; end if;

  out_source := 'campaign';
  out_campaign_id := camp.id;
  out_campaign_name := camp.name;
  return next;
end;
$function$;
