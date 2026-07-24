-- LINKA — confirmação de conteúdo: o agente reporta o que está realmente exibindo.
-- content_url = o que o painel MANDOU exibir; playing_url = o que o aparelho CONFIRMA exibindo.
-- Quando os dois batem, o conteúdo pegou (mostra "no ar" no painel).
alter table public.devices add column playing_url text;
comment on column public.devices.playing_url is 'URL que o agente confirma estar exibindo (bate com content_url = conteúdo no ar).';
