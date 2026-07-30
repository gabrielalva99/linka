-- LINKA — quantos pacotes foram medidos e ninguem classificou.
--
-- Fecha o buraco estrutural achado na varredura de UX de 30/07: pacote AUSENTE do
-- app_catalog nao e ignorado — ele entra como recurso testado pelo cliente, com
-- nome de programador. Foi assim que o launcher da tela externa do Razr virou
-- "recurso mais usado" na ficha do aparelho.
--
-- Catalogar os 14 conhecidos resolveu ontem. Isto resolve amanha: o numero fica na
-- tela inicial, entre as pendencias que nao apitam, e alguem classifica antes de o
-- relatorio mentir. Tratar desconhecido como ruido por padrao seria pior —
-- esconderia recurso de verdade em silencio.
--
-- security invoker de proposito: a contagem passa pelo RLS de devices, entao cada
-- cliente conta os pacotes medidos NA FROTA DELE.
create or replace function public.pacotes_sem_classificacao()
returns integer language sql stable security invoker set search_path to 'public' as $$
  select count(distinct e.package)::int
  from public.device_events e
  join public.devices d on d.id = e.device_id
  left join public.app_catalog c on c.package = e.package
  where e.kind = 'app_usage' and c.package is null;
$$;

comment on function public.pacotes_sem_classificacao() is
  'Quantos pacotes foram medidos e nao estao no app_catalog. Sem registro, o pacote entra como recurso do cliente com nome tecnico — ver migration 20260730002000.';

grant execute on function public.pacotes_sem_classificacao() to authenticated;
