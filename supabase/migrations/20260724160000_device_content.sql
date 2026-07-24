-- LINKA — R1 player (esqueleto): URL de conteúdo por aparelho.
-- Placeholder simples do R1; no R2 vira campanha/playlist com camadas e agendamento.
alter table public.devices add column content_url text;
comment on column public.devices.content_url is 'URL do conteúdo (vídeo) que o aparelho exibe. Placeholder do R1; evolui para campanha/playlist no R2.';
