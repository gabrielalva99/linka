-- LINKA — enquadramento por aparelho.
-- O enquadramento certo depende da relação entre o vídeo e a TELA: o mesmo arquivo
-- corta mais num Razr (tela comprida) que num G06. Então o arquivo define o padrão
-- (evita 250 cliques) e o aparelho pode sobrepor quando a tela dele pede.
alter table public.devices add column content_fit public.content_fit;
comment on column public.devices.content_fit is 'Enquadramento específico deste aparelho; nulo = usa o padrão do arquivo (media_assets.fit_mode).';
