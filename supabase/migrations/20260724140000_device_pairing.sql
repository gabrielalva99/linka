-- LINKA — R1 pareamento do agente: token do device + código de pareamento automático.
-- O código de pareamento é gerado sozinho ao registrar o aparelho; o agente o informa
-- uma vez (provision) e recebe um device_token, usado nos heartbeats seguintes.

alter table public.devices add column device_token text unique;

-- código de pareamento: 8 caracteres hex maiúsculos, gerado por padrão no registro
alter table public.devices
  alter column provisioning_code set default upper(substr(md5(gen_random_uuid()::text), 1, 8));

-- backfill dos aparelhos já existentes (exemplos) que estão sem código
update public.devices
set provisioning_code = upper(substr(md5(gen_random_uuid()::text), 1, 8))
where provisioning_code is null;

alter table public.devices
  add constraint devices_provisioning_code_key unique (provisioning_code);

comment on column public.devices.device_token is 'Segredo do aparelho, definido no pareamento (provision) e usado para autenticar os heartbeats.';
comment on column public.devices.provisioning_code is 'Código curto de pareamento, gerado no registro; o agente informa uma vez para se vincular.';
