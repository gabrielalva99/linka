-- LINKA — identidade do aparelho reportada por ele mesmo.
-- Digitar modelo em 250 aparelhos é inviável e erra; o aparelho sabe se identificar.
alter table public.devices add column hardware_model text;
comment on column public.devices.hardware_model is 'Modelo informado pelo próprio aparelho (Build.MANUFACTURER + Build.MODEL). Fato bruto; model_id é o catálogo curado.';

-- O que chamávamos de "serial" é o Android ID: o serial de fábrica exige
-- privilégio de device owner (indisponível hoje). Separar os dois evita confusão.
alter table public.devices add column android_id text;
comment on column public.devices.android_id is 'Settings.Secure.ANDROID_ID — identificador estável do par app/aparelho.';
comment on column public.devices.serial is 'Serial de fábrica (só com device owner). Não confundir com android_id.';

update public.devices set android_id = serial where serial is not null;
update public.devices set serial = null where android_id is not null;

create index devices_android_id_idx on public.devices (tenant_id, android_id);
