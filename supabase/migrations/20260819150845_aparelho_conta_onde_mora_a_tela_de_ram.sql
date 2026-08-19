-- O aparelho conta onde encontrou a tela de Otimizacao de RAM.
--
-- O CASO (19/08): o botao aparecia no Razr e NAO aparecia nos Moto G. O botao
-- so existe quando a tela existe, e a busca cobria dois pacotes conhecidos —
-- nos Moto G ela mora em outro lugar.
--
-- E NAO DAVA PARA DESCOBRIR DE LONGE: a tela nao tem icone, entao o pacote dela
-- nao entra no inventario que o aparelho manda. A unica forma era ter o
-- aparelho na mao, e eles estao na loja. Diagnostico que depende de viagem nao
-- e diagnostico.
--
-- Agora o proprio aparelho diz "achei em pacote/classe" ou "procurei e nao
-- tem". Com isso da para ver a frota inteira de uma vez e ajustar a busca com
-- dado real em vez de palpite sobre nome de pacote de fabricante.
alter table public.devices
  add column if not exists tela_de_ram text;

comment on column public.devices.tela_de_ram is
  'Onde o aparelho encontrou a tela de Otimizacao de RAM ("pacote/classe"), ou vazio quando procurou e nao existe neste modelo.';
