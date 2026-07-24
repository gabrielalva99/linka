-- LINKA — R1 mídia: biblioteca de conteúdo + bucket de Storage.

-- ── Biblioteca de mídia ───────────────────────────────────────────────────
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  storage_path text not null,
  url text not null,
  content_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
comment on table public.media_assets is 'Arquivos de conteúdo (vídeo/imagem) enviados ao Storage e disponíveis para exibição.';
create index on public.media_assets (tenant_id, created_at desc);

alter table public.media_assets enable row level security;
create policy media_select on public.media_assets
  for select using (private.has_tenant_access(tenant_id));
create policy media_insert on public.media_assets
  for insert with check (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));
create policy media_delete on public.media_assets
  for delete using (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));

-- ── Bucket de Storage (público para leitura pelos aparelhos) ──────────────
insert into storage.buckets (id, name, public)
values ('content', 'content', true)
on conflict (id) do nothing;

-- leitura pública (aparelhos baixam sem login); escrita só autenticado
create policy content_read_public on storage.objects
  for select using (bucket_id = 'content');
create policy content_write_auth on storage.objects
  for insert to authenticated with check (bucket_id = 'content');
