alter table public.devices add column adb_enabled boolean;
comment on column public.devices.adb_enabled is 'Depuração USB ligada, reportada pelo aparelho — o painel não adivinha.';

update public.devices set pending_command = null where pending_command = 'debug_probe';
