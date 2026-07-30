-- LINKA — a lista de APKs deixa de ser legivel por qualquer usuario logado.
--
-- Apontado pelo verificador do Supabase e confirmado no codigo: a politica
-- `releases_read_auth` dava SELECT em storage.objects do bucket `releases` para
-- TODO usuario autenticado, sem outra condicao. Isso permite LISTAR o bucket.
--
-- POR QUE SAI. Ninguem precisa dela:
--   - o agente baixa o APK por URL publica direta (o bucket e publico), e URL de
--     objeto nao passa por esta politica;
--   - o painel so ENVIA e pede a URL publica (publish-form.tsx) — nunca lista;
--   - o historico de versoes vem da tabela agent_releases, nao do bucket.
--
-- O QUE ELA VAZAVA. Nao e catastrofico — sao APKs que ja estao publicos por URL —
-- mas entrega a lista de tudo que ja foi publicado, inclusive versoes de teste que
-- nunca foram anunciadas e nomes de arquivo que nao deveriam circular. Num produto
-- que vai atender marcas concorrentes na mesma plataforma, "quanto o outro
-- consegue enxergar da nossa operacao" e pergunta de contrato.
--
-- O QUE CONTINUA TRAVADO, e foi medido nesta mesma varredura: subir e substituir
-- APK exigem superadmin. Era o ponto que mais me preocupava — APK falso no bucket
-- vira codigo arbitrario rodando em 250 aparelhos de loja, instalado sozinho.
-- Ataque testado como agencia: BLOQUEADO.

drop policy if exists releases_read_auth on storage.objects;

comment on table storage.objects is
  'Objetos do Storage. releases: envio/substituicao so por superadmin, sem politica de leitura (o download e por URL publica). content: leitura e escrita por cliente, na pasta do proprio tenant.';
