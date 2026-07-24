-- LINKA — campanha com vários vídeos em rodízio.
-- Uma vitrine não vive de um vídeo só: a campanha vira uma lista ordenada e o
-- item da vez sai do relógio (todos os aparelhos giram juntos, sem combinar nada).
alter table public.campaigns
  add column rotation_seconds integer not null default 1200
    check (rotation_seconds between 10 and 86400);
comment on column public.campaigns.rotation_seconds is 'Tempo de cada vídeo no ar antes de passar para o próximo (padrão 20 min).';

create table public.campaign_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  media_id uuid not null references public.media_assets (id) on delete restrict,
  position integer not null,
  fit_mode public.content_fit,
  created_at timestamptz not null default now(),
  unique (campaign_id, position)
);
comment on table public.campaign_items is 'Vídeos da campanha, na ordem de exibição.';
create index on public.campaign_items (campaign_id, position);

alter table public.campaign_items enable row level security;
create policy campaign_items_select on public.campaign_items
  for select using (private.has_tenant_access(tenant_id));
create policy campaign_items_write on public.campaign_items
  for all using (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]))
  with check (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));

-- Campanhas de um vídeo só viram lista de um item (sem perder nada).
insert into public.campaign_items (tenant_id, campaign_id, media_id, position, fit_mode)
select tenant_id, id, media_id, 1, fit_mode from public.campaigns;

alter table public.campaigns drop column media_id;

/**
 * Decide o que um aparelho deve exibir AGORA.
 * Precedência: vídeo fixo no aparelho > campanha mais específica (aparelho >
 * loja > rede > todos). Datas/horários no fuso da loja; dentro da campanha, o
 * item da vez vem do relógio — o mesmo instante dá o mesmo item em toda a frota.
 */
create or replace function public.resolve_device_content(p_device_id uuid)
returns table (
  out_url text,
  out_fit public.content_fit,
  out_source text,
  out_campaign_id uuid,
  out_campaign_name text
)
language plpgsql stable
set search_path = public
as $$
declare
  dev record;
  loc timestamp;
  camp record;
  item record;
  total integer;
  idx integer;
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

  select c.id, c.name, c.fit_mode, c.rotation_seconds, t.scope
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
            c.updated_at desc
   limit 1;
  if not found then return; end if;

  select count(*) into total from public.campaign_items where campaign_id = camp.id;
  if total = 0 then return; end if;

  -- Item da vez pelo relógio: determinístico, sem estado no aparelho.
  idx := (floor(extract(epoch from now()) / camp.rotation_seconds)::bigint % total)::integer;

  select ci.media_id, ci.fit_mode
    into item
    from public.campaign_items ci
   where ci.campaign_id = camp.id
   order by ci.position
   offset idx limit 1;
  if not found then return; end if;

  select m.url, coalesce(dev.content_fit, item.fit_mode, camp.fit_mode, m.fit_mode, 'zoom')
    into out_url, out_fit
    from public.media_assets m
   where m.id = item.media_id;
  if out_url is null then return; end if;

  out_source := 'campaign';
  out_campaign_id := camp.id;
  out_campaign_name := camp.name;
  return next;
end;
$$;
