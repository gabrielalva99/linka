-- LINKA — som da vitrine e atualização do app sem cabo.

-- Som: a vitrine é MUDA por padrão. O cliente pode abrir o YouTube para testar
-- alto-falante; nosso áudio por baixo seria o pior defeito possível numa loja.
alter table public.devices
  add column volume_percent integer not null default 0
    check (volume_percent between 0 and 100);
comment on column public.devices.volume_percent is 'Volume do vídeo (0 = mudo). O agente só emite som com o app em primeiro plano.';

-- Atualização remota: 250 aparelhos em 15 lojas não voltam para o cabo a cada
-- correção. Como device owner, o agente instala a nova versão sozinho.
create table public.agent_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  url text not null,
  notes text,
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.agent_releases is 'Versões do APK do agente. A marcada como atual é distribuída à frota.';

alter table public.agent_releases enable row level security;
create policy releases_select on public.agent_releases
  for select using (auth.uid() is not null);
create policy releases_write on public.agent_releases
  for all using (private.is_superadmin()) with check (private.is_superadmin());

create unique index agent_releases_one_current on public.agent_releases (is_current)
  where is_current;
