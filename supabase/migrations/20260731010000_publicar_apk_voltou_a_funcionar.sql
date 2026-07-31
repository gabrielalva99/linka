-- LINKA — devolve ao superadmin a leitura do bucket `releases`.
--
-- O QUE EU QUEBREI. Na migration 20260730060000 eu dropei `releases_read_auth`
-- para o bucket parar de ser listavel por qualquer usuario logado. O motivo
-- continua valido. O erro foi nao ter posto NADA no lugar: aquela era a unica
-- politica de SELECT do bucket, entao o superadmin tambem parou de enxergar.
--
-- POR QUE ISSO DERRUBA O ENVIO, e nao so a listagem. O painel envia o APK com
-- `upsert: true` — publicar a mesma versao de novo precisa substituir, nao falhar.
-- Upsert e INSERT ... ON CONFLICT DO UPDATE, e para resolver o conflito o
-- Postgres precisa ENXERGAR a linha conflitante. Sem politica de SELECT, o
-- Storage recusa e devolve 400.
--
-- COMO APARECEU. O Gabriel foi publicar a 0.53.0 e levou "Envio recusado. So o
-- superadmin pode publicar versoes" — logado como superadmin. A mensagem era um
-- chute do painel (corrigido no mesmo dia: agora ela so acusa permissao quando o
-- servidor de fato recusou por permissao) e apontou para o lugar errado.
--
-- O rastro que fechou o diagnostico: o ultimo APK que subiu foi
-- linka-agente-0.47.0.apk, em 29/07 23:14 — horas antes da minha migration. Nada
-- subiu depois. E 0.47.0 e exatamente a versao em que a frota ficou presa.
--
-- A CORRECAO, mais estreita do que era antes:
--   antes de mim   qualquer usuario logado LISTAVA os APKs
--   depois de mim  ninguem enxergava, nem o superadmin  <- quebrado
--   agora          so o superadmin enxerga
--
-- O download do agente continua sem depender disto: o bucket e publico e a URL
-- do objeto nao passa por politica. Cliente e agencia continuam sem conseguir
-- listar o que ja foi publicado, que era o ponto da 20260730060000.
--
-- LICAO, e ela e a mesma de sempre: dropar politica sem testar o caminho feliz
-- de quem PRECISA passar. Eu testei o ataque (agencia bloqueada: certo) e nao
-- testei o uso legitimo (superadmin publicando). Toda migration que tira
-- permissao tem dois testes, nao um.

create policy releases_read_superadmin
  on storage.objects for select
  to authenticated
  using (bucket_id = 'releases' and private.is_superadmin());

-- (Sem `comment on table storage.objects` aqui: a tabela e do Storage, nao nossa,
-- e comentar exige ser dono dela. A migration inteira falha por causa de uma
-- linha cosmetica.)
