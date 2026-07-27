-- LINKA — faxina diária do aparelho de demonstração.
-- O cliente tira foto, abre YouTube, navega. No dia seguinte a vitrine tem que
-- amanhecer limpa, sem ninguém ir até a loja.
alter table public.devices
  add column cleanup_enabled boolean not null default true,
  add column cleanup_time time not null default '23:00',
  add column last_cleanup_at timestamptz,
  add column last_cleanup_result text;

comment on column public.devices.cleanup_time is 'Horário LOCAL do aparelho para a faxina diária.';
comment on column public.devices.last_cleanup_result is 'O que foi apagado na última faxina — o painel não deve supor que rodou.';
