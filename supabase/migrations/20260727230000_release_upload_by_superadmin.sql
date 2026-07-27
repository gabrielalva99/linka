-- Publicar uma versão do agente dependia de alguém com a chave de serviço
-- rodando comando na máquina. Isso não escala para 250 aparelhos e cria um
-- gargalo numa pessoa: quem publica passa a ser o superadmin, pelo painel.
-- O bucket já era público para leitura (o aparelho baixa sem login); o que
-- faltava era permissão de ESCRITA para quem tem direito.
create policy releases_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'releases' and private.is_superadmin());

create policy releases_replace on storage.objects
  for update to authenticated
  using (bucket_id = 'releases' and private.is_superadmin())
  with check (bucket_id = 'releases' and private.is_superadmin());
