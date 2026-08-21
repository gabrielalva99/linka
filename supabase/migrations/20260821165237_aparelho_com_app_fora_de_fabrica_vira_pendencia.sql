-- Quantos aparelhos têm aplicativo que não veio de fábrica.
--
-- POR QUE EXISTE. O Gabriel limpou apps de vários aparelhos na mão, entrando em
-- um por um, porque nada no painel dizia QUAIS precisavam. O inventário já
-- reportava tudo (device_apps.is_system), mas o dado só aparecia dentro da ficha
-- de cada aparelho: para descobrir os cinco que precisavam de limpeza, era
-- preciso abrir os quinze.
--
-- Numa frota de 250, isso deixa de ser trabalhoso e passa a ser impossível.
--
-- O QUE CONTA COMO "DE FÁBRICA". Quem decide é o aparelho, no inventário: app
-- marcado com FLAG_SYSTEM ou FLAG_UPDATED_SYSTEM_APP é de fábrica (o segundo
-- cobre o app que veio no aparelho e depois se atualizou). O que sobra foi
-- alguém que instalou, e numa vitrine isso é sempre algo a remover.
--
-- FILTRO DE CLIENTE DESDE O NASCIMENTO. Hoje mesmo um aviso sem esse filtro
-- apitou na tela da marca errada e levou a uma tela vazia. Nulo continua
-- contando tudo, que é o certo para quem olha a plataforma sem escolher marca.
create or replace function public.aparelhos_com_app_fora_de_fabrica(p_tenant uuid default null)
returns integer
language sql
stable
set search_path to 'public'
as $function$
  select count(distinct a.device_id)::int
  from public.device_apps a
  join public.devices d on d.id = a.device_id
  where a.is_system = false
    and d.is_active
    and not d.exclude_from_reports
    and (p_tenant is null or d.tenant_id = p_tenant);
$function$;

comment on function public.aparelhos_com_app_fora_de_fabrica(uuid) is
  'Aparelhos ativos com pelo menos um aplicativo que não veio de fábrica.';

-- A LISTA, para o aviso ter para onde levar.
--
-- Aviso que não leva a lugar nenhum ensina a equipe a ignorar o bloco inteiro.
create or replace function public.aparelhos_com_app_fora_de_fabrica_lista(p_tenant uuid default null)
returns table (device_id uuid, quantos integer, apps text)
language sql
stable
set search_path to 'public'
as $function$
  select a.device_id,
         count(*)::int as quantos,
         string_agg(coalesce(nullif(a.label, ''), a.package), ', ' order by a.label) as apps
  from public.device_apps a
  join public.devices d on d.id = a.device_id
  where a.is_system = false
    and d.is_active
    and not d.exclude_from_reports
    and (p_tenant is null or d.tenant_id = p_tenant)
  group by a.device_id;
$function$;

comment on function public.aparelhos_com_app_fora_de_fabrica_lista(uuid) is
  'Por aparelho: quantos e quais aplicativos não vieram de fábrica.';
