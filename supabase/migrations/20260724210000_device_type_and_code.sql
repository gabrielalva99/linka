-- LINKA — tipo de dispositivo e código automático.
-- A frota é heterogênea (celular, TV player, notebook — REFERENCIA §2); o painel
-- precisa separar por tipo, e o código operacional não deve depender de digitação.
create type public.device_type as enum ('smartphone', 'tablet', 'tv', 'notebook', 'other');

alter table public.devices
  add column device_type public.device_type not null default 'smartphone';
comment on column public.devices.device_type is 'Tipo do aparelho — separa as abas da frota (celular, TV, notebook…).';

-- Código sequencial por cliente quando não informado (padrão Product.Me: 001, 002…).
create or replace function public.set_device_code()
returns trigger language plpgsql
set search_path = public
as $$
declare next_code int;
begin
  if new.code is null or btrim(new.code) = '' then
    select coalesce(max(nullif(regexp_replace(code, '\D', '', 'g'), '')::int), 0) + 1
      into next_code
      from public.devices
     where tenant_id = new.tenant_id;
    new.code := lpad(next_code::text, 3, '0');
  end if;
  return new;
end;
$$;

create trigger devices_set_code
  before insert on public.devices
  for each row execute function public.set_device_code();

-- Aparelhos já cadastrados sem código recebem um agora (ordem de criação).
with numbered as (
  select id, tenant_id,
         row_number() over (partition by tenant_id order by created_at) +
           coalesce((select max(nullif(regexp_replace(d2.code, '\D', '', 'g'), '')::int)
                       from public.devices d2 where d2.tenant_id = d.tenant_id), 0) as n
    from public.devices d
   where code is null or btrim(code) = ''
)
update public.devices d
   set code = lpad(numbered.n::text, 3, '0')
  from numbered
 where d.id = numbered.id;
