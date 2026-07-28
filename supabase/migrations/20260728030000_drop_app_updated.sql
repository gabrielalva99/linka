-- Duas fontes de verdade para o mesmo fato, e a errada estava na tela.
-- "App atualizado 1 de 2" com os DOIS aparelhos na 0.20.0: o campo era
-- calculado no aparelho, comparando a versão em execução com uma versão
-- publicada guardada em cache, então ficava uma batida atrás. Aparelho que
-- nunca buscou conteúdo nem respondia.
--
-- O servidor tem os dois lados: devices.agent_version e a release atual.
-- Comparar aqui é exato e instantâneo. A coluna sai para ninguém voltar a usá-la.
alter table public.devices drop column app_updated;
