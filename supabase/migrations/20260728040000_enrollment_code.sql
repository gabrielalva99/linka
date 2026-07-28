-- O fluxo estava invertido em relação ao que acontece na loja.
--
-- Para parear era preciso cadastrar o aparelho ANTES, no painel, e levar um
-- código por aparelho para o campo. Só que quem está na loja tem o celular na
-- mão e ainda não sabe qual é: o aparelho é que deveria se apresentar.
--
-- Agora existe UM código por cliente, que vai no kit do técnico. O aparelho se
-- inscreve sozinho e chega ao painel já dizendo modelo, Android e identificador.
-- Falta só dizer em que loja ele está, que é a única coisa que o aparelho
-- realmente não tem como saber.
alter table public.tenants
  add column enrollment_code text unique;

comment on column public.tenants.enrollment_code is 'Código de inscrição do cliente: um só, vai no kit de campo. O aparelho se cadastra sozinho com ele.';

-- Código curto e sem ambiguidade: o técnico pode ter que digitar à mão.
-- Sem 0/O e sem 1/I, que é onde se erra ditando código por telefone.
update public.tenants
set enrollment_code = 'LK' || upper(
  translate(substr(encode(gen_random_bytes(8), 'base64'), 1, 6), '01OIloi/+=', 'ABCDEFGHJK')
)
where enrollment_code is null;

alter table public.tenants alter column enrollment_code set not null;
