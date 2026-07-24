-- LINKA — campanhas: o que exibir (What), quando (When) e onde (Where).
-- Substitui o atalho "um vídeo por aparelho" como forma normal de operar:
-- ninguém clica 250 vezes. O vídeo fixo no aparelho continua existindo como
-- exceção (troubleshooting) e tem a maior precedência.
create type public.campaign_scope as enum ('tenant', 'chain', 'store', 'device');

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  media_id uuid not null references public.media_assets (id) on delete restrict,
  fit_mode public.content_fit,
  starts_on date,
  ends_on date,
  start_time time,
  end_time time,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.campaigns is 'Peça + janela de exibição. Horários valem no fuso da LOJA do aparelho.';
comment on column public.campaigns.fit_mode is 'Enquadramento da campanha; nulo = usa o padrão do arquivo.';
create index on public.campaigns (tenant_id, is_active);

-- Alvo em camadas. Colunas separadas (em vez de um id genérico) para o banco
-- garantir integridade: alvo apagado, alvo removido da campanha.
create table public.campaign_targets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  scope public.campaign_scope not null,
  chain_id uuid references public.retail_chains (id) on delete cascade,
  store_id uuid references public.stores (id) on delete cascade,
  device_id uuid references public.devices (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint campaign_target_shape check (
    (scope = 'tenant' and chain_id is null and store_id is null and device_id is null)
    or (scope = 'chain' and chain_id is not null and store_id is null and device_id is null)
    or (scope = 'store' and store_id is not null and chain_id is null and device_id is null)
    or (scope = 'device' and device_id is not null and chain_id is null and store_id is null)
  )
);
create index on public.campaign_targets (campaign_id);

alter table public.campaigns enable row level security;
alter table public.campaign_targets enable row level security;

create policy campaigns_select on public.campaigns
  for select using (private.has_tenant_access(tenant_id));
create policy campaigns_write on public.campaigns
  for all using (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]))
  with check (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));

create policy campaign_targets_select on public.campaign_targets
  for select using (private.has_tenant_access(tenant_id));
create policy campaign_targets_write on public.campaign_targets
  for all using (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]))
  with check (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));

create trigger set_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();

/**
 * Decide o que um aparelho deve exibir AGORA.
 * Precedência: vídeo fixo no aparelho > campanha mais específica (aparelho >
 * loja > rede > todos). Datas e horários são avaliados no fuso da loja — 22h
 * em Manaus não é 22h em São Paulo.
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
begin
  select d.id, d.tenant_id, d.store_id, d.content_url, d.content_fit,
         s.chain_id, coalesce(s.timezone, 'America/Sao_Paulo') as tz
    into dev
    from public.devices d
    left join public.stores s on s.id = d.store_id
   where d.id = p_device_id;
  if not found then return; end if;

  -- Exceção manual no aparelho ganha de qualquer campanha.
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

  select c.id, c.name, c.media_id, c.fit_mode, t.scope
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
       -- janela que vira a meia-noite (ex.: 22h às 6h)
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

  select m.url, coalesce(dev.content_fit, camp.fit_mode, m.fit_mode, 'zoom')
    into out_url, out_fit
    from public.media_assets m
   where m.id = camp.media_id;
  if out_url is null then return; end if;

  out_source := 'campaign';
  out_campaign_id := camp.id;
  out_campaign_name := camp.name;
  return next;
end;
$$;
