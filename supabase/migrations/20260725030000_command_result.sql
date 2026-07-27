alter table public.devices add column last_command_result text;
comment on column public.devices.last_command_result is 'Resposta do último comando executado no aparelho — diagnóstico remoto sem depender de cabo.';
