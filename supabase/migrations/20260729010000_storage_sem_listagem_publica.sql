-- LINKA — parar de deixar qualquer um LISTAR os arquivos de todos os clientes.
--
-- Achado em pentest, confirmado atacando o ambiente real: com a chave pública
-- do painel (que vai no navegador e portanto é de quem quiser), dava para
-- listar o bucket inteiro. Primeiro as PASTAS, que são os ids dos clientes —
-- ou seja, quantos clientes existem. Depois, dentro de cada uma, todos os
-- arquivos com nome, tamanho e data.
--
-- Nome de arquivo é informação comercial. "motorolacopadomundo.mp4" não
-- machuca ninguém; "edge70_lancamento_dezembro.mp4" entrega lançamento não
-- anunciado, e a data de envio entrega o calendário da campanha. Para uma marca
-- concorrente isso vale dinheiro.
--
-- A correção NÃO fecha o download. O balde continua público, e o endereço
-- público (/object/public/...) é servido sem passar por RLS: é assim que os 250
-- aparelhos baixam vídeo sem login e é assim que continua. O que fica restrito é
-- LISTAR, que é o que transforma "preciso saber o endereço exato" em "me dá a
-- lista inteira".
--
-- Quem lista de verdade é o painel, com pessoa logada, e só do próprio cliente.

drop policy if exists content_read_public on storage.objects;

create policy content_read_tenant on storage.objects
  for select to authenticated
  using (
    bucket_id = 'content'
    and private.has_tenant_access((split_part(name, '/', 1))::uuid)
  );

-- O APK do agente é o mesmo caso, com menos sensibilidade: listar entrega o
-- histórico de versões. Baixar continua aberto, porque é o aparelho quem baixa.
drop policy if exists releases_read on storage.objects;

create policy releases_read_auth on storage.objects
  for select to authenticated
  using (bucket_id = 'releases');
