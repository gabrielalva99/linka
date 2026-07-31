-- LINKA - as duas funcoes puras de protecao ganham search_path fixo.
--
-- Apontado pelo conselheiro de seguranca do Supabase na varredura de 31/07:
-- funcao sem search_path fixo resolve nomes conforme o ambiente de QUEM chama.
-- Estas duas so usam operadores de jsonb do catalogo, entao nao ha ataque
-- pratico hoje - mas travar custa uma linha e elimina a classe inteira: se um
-- dia alguem acrescentar uma referencia a tabela, ela ja nasce resolvendo no
-- lugar certo em vez de herdar o costume perigoso.
--
-- Vazio, e nao 'public', porque elas nao precisam de NADA alem do catalogo
-- (pg_catalog e sempre consultado). O que nao se usa, nao se concede.

alter function public.protecao_de_pe(jsonb) set search_path = '';
alter function public.protecoes_faltando(jsonb) set search_path = '';
