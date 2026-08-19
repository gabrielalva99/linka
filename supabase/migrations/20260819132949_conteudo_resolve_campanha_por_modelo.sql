-- O aparelho passa a enxergar campanha mirada no MODELO dele.
--
-- ORDEM DE ESPECIFICIDADE, e o porque desta escolha:
--   device (5) > model (4) > store (3) > chain (2) > tenant (1)
--
-- Modelo entra logo abaixo de aparelho porque descreve o APARELHO, e nao o
-- lugar onde ele esta. Se a loja tem uma acao local e o Razr tem uma peca
-- propria de lancamento, o Razr mostra a peca dele — que e o que a marca
-- espera de um aparelho de demonstracao. Loja continua vencendo rede, e rede
-- continua vencendo "todos".
--
-- Se esta ordem estiver errada para a operacao, o conserto e uma linha nesta
-- funcao: e uma decisao de produto, nao uma restricao tecnica.
create or replace function public.resolve_device_content(p_device_id uuid)
returns table(out_url text, out_fit content_fit, out_source text, out_campaign_id uuid, out_campaign_name text)
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  dev record;
  loc timestamp;
  camp record;
  item record;
  total integer;
  idx integer;
begin
  select d.id, d.tenant_id, d.store_id, d.content_url, d.content_fit, d.model_id,
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
       or (t.scope = 'model' and t.model_id = dev.model_id)
       or (t.scope = 'device' and t.device_id = dev.id)
     )
   order by case t.scope
              when 'device' then 5 when 'model' then 4 when 'store' then 3
              when 'chain' then 2 else 1
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
