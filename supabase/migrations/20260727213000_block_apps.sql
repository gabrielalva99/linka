-- LINKA — bloquear apps que permitem sabotar a vitrine.
-- Ajustes: é por lá que se cria senha de tela (o Android não tem trava específica
-- para isso). Play Store: instalar app qualquer num aparelho de demonstração.
-- Câmera, YouTube e o resto continuam livres — o cliente ainda testa o aparelho.
alter table public.devices
  add column block_settings boolean not null default false,
  add column blocked_apps text;

comment on column public.devices.block_settings is 'Bloquear o app de Ajustes e a Play Store neste aparelho.';
comment on column public.devices.blocked_apps is 'O que o aparelho confirma ter bloqueado de fato.';
