-- LINKA — estado do kiosk e canal de comando por aparelho (ADR-7).
-- Virar "dono do aparelho" só se desfaz pelo próprio app ou por factory reset.
-- Logo, o comando de desprovisionar é pré-requisito do rollout, não item futuro.
alter table public.devices
  add column is_device_owner boolean not null default false,
  add column kiosk_locked boolean not null default false,
  add column pending_command text;

comment on column public.devices.is_device_owner is 'O app confirma estar como device owner neste aparelho.';
comment on column public.devices.kiosk_locked is 'Restrições de Wi-Fi/modo avião confirmadas aplicadas pelo app.';
comment on column public.devices.pending_command is 'Comando aguardando o próximo heartbeat (ex.: deprovision). O app limpa ao concluir.';
