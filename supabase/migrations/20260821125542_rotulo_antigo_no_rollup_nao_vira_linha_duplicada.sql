-- Trocar o nome de um recurso no catálogo partia a linha do relatório em duas.
--
-- O CASO (21/08). Em 20/08 à noite eu corrigi "Camera" para "Câmera" no catálogo
-- e cadastrei "Otimização de RAM", que faltava. O relatório do dia seguinte
-- mostrava "Câmera 28" e "Camera 14" — duas linhas para a mesma coisa, e o
-- Gabriel viu na hora.
--
-- A CAUSA. `rollup_toque_hora` guarda o NOME JÁ TRADUZIDO, resolvido no momento
-- em que a linha é escrita. O preenchimento reescreve só os dias recentes, então
-- 19 e 20/08 pegaram a grafia nova e 03 a 18/08 ficaram com a velha. Duas
-- grafias, duas linhas — porque o relatório agrupa por nome.
--
-- É a SEGUNDA vez que esta classe aparece: em 19/08 o relatório mostrava
-- "Camera", "Camera" e "Camera2" como três recursos distintos. Naquela vez a
-- causa era outra (pacotes diferentes), mas o sintoma é o mesmo — e a raiz
-- comum é o rollup guardar texto de exibição em vez de guardar a chave e
-- traduzir na leitura.
--
-- AQUI VAI SÓ O CONSERTO DO DADO. A raiz fica registrada no backlog: enquanto o
-- rollup guardar o nome, toda correção de grafia vai partir o histórico de novo.
update public.rollup_toque_hora set recurso = 'Câmera' where recurso = 'Camera';
update public.rollup_toque_hora set recurso = 'Otimização de RAM' where recurso = 'linka:ram';

-- Mesma checagem no rollup de recurso, que guarda o nome pelo mesmo desenho.
update public.rollup_recurso_hora set recurso = 'Câmera' where recurso = 'Camera';
update public.rollup_recurso_hora set recurso = 'Otimização de RAM' where recurso = 'linka:ram';
