-- LINKA — enquadramento do conteúdo + gestão da biblioteca.
-- zoom = preenche a tela cortando as bordas · fit = mostra o vídeo inteiro (barras pretas).
-- O enquadramento é propriedade do ARQUIVO (um vídeo com logo no topo nunca pode ser cortado),
-- então vale para todos os aparelhos que exibirem aquele conteúdo.
create type public.content_fit as enum ('zoom', 'fit');

alter table public.media_assets
  add column fit_mode public.content_fit not null default 'zoom';
comment on column public.media_assets.fit_mode is 'Enquadramento na tela: zoom (preenche cortando) ou fit (vídeo inteiro com barras).';

alter table public.devices add column playing_fit public.content_fit;
comment on column public.devices.playing_fit is 'Enquadramento que o agente confirma estar aplicando (bate com o do arquivo = no ar).';

-- Faltava UPDATE na biblioteca (necessário para alternar o enquadramento).
create policy media_update on public.media_assets
  for update using (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]))
  with check (private.has_tenant_role(tenant_id, array['agency']::public.membership_role[]));

-- Exclusão de arquivos no Storage (limpeza de vídeos antigos/duplicados).
create policy content_delete_auth on storage.objects
  for delete to authenticated using (bucket_id = 'content');
