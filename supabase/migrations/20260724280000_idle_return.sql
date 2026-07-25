-- LINKA — retorno automático à vitrine.
-- O cliente pode testar câmera, tela, som — mas o aparelho não pode ficar
-- abandonado num app aberto. Depois de N segundos fora, volta ao vídeo sozinho.
alter table public.devices
  add column idle_return_seconds integer not null default 30
    check (idle_return_seconds between 5 and 3600);
comment on column public.devices.idle_return_seconds is 'Segundos fora do app antes de voltar sozinho para a vitrine (padrão Product.Me: 15s).';
