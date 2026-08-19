-- O aparelho passa a contar o que esta tentando, e nao so quando desiste.
--
-- O CASO (19/08): o Moto G06 ficou horas para tras e o campo de erro estava
-- vazio o tempo todo, porque o agente so escreve ali depois de DESISTIR (tres
-- tentativas). "Estou baixando" e "falhei duas vezes, vou tentar de novo" nao
-- existiam em lugar nenhum — nem no aparelho, nem no painel.
--
-- Campo de TEXTO curto, escrito pelo proprio aparelho, porque quem sabe o
-- motivo e ele: rede que nao respondeu, arquivo que veio pela metade, disco
-- cheio. O servidor nao tem como adivinhar nenhum dos tres.
alter table public.devices
  add column if not exists update_state text;

comment on column public.devices.update_state is
  'O que o aparelho esta fazendo (ou tentando) para atualizar. Escrito por ele; nulo quando esta na versao publicada.';
