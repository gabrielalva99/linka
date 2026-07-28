-- 1. Bloqueio de Ajustes e Play Store passa a nascer LIGADO.
--
-- Estava desligado por padrão, então cada aparelho novo chegava à loja com a
-- porta aberta e alguém tinha que lembrar de fechar, um por um. Com 250
-- aparelhos, "lembrar" não é um mecanismo. Vitrine com Ajustes liberado é
-- vitrine em que dá para criar senha de tela e instalar o que quiser.
alter table public.devices alter column block_settings set default true;

-- 2. Senha de tela: o painel precisa DIZER quando existe.
--
-- Este hardware recusa o token de reset do Android (testado), então apagar a
-- senha remotamente não é possível. O que não pode acontecer é o aparelho ir
-- para a prateleira com uma senha que ninguém sabe: depois de qualquer
-- reinício, a loja fica com uma vitrine pedindo PIN.
alter table public.devices add column screen_lock_set boolean;

comment on column public.devices.screen_lock_set is 'O aparelho tem senha/PIN de tela. Não dá para apagar remotamente neste hardware: tem que sair antes de ir para a loja.';
