-- Grava o pico de memória da faixa de 10 minutos.
--
-- Função e não upsert direto da função de borda porque o `greatest` no conflito
-- precisa comparar com o que já está lá. Feito no banco, é uma escrita só, sem
-- ida e volta: a batida acontece a cada 60 segundos em 250 aparelhos, e uma
-- leitura extra por batida seria 360 mil leituras por dia para nada.
--
-- GUARDA O PICO, não a média. Quem mata o aplicativo é o pico: a média esconde
-- exatamente o instante que interessa.
create or replace function public.registrar_memoria(
  p_device uuid,
  p_tenant uuid,
  p_faixa timestamptz,
  p_usado integer,
  p_teto integer,
  p_nativo integer
)
returns void
language sql
security definer
set search_path = ''
as $function$
  insert into public.device_memoria
    (device_id, tenant_id, faixa, heap_usado_mb, heap_teto_mb, heap_nativo_mb)
  values (p_device, p_tenant, p_faixa, p_usado, p_teto, p_nativo)
  on conflict (device_id, faixa) do update
    set heap_usado_mb  = greatest(public.device_memoria.heap_usado_mb, excluded.heap_usado_mb),
        heap_nativo_mb = greatest(public.device_memoria.heap_nativo_mb, excluded.heap_nativo_mb),
        heap_teto_mb   = excluded.heap_teto_mb;
$function$;

comment on function public.registrar_memoria(uuid, uuid, timestamptz, integer, integer, integer) is
  'Guarda o pico de memória do aplicativo na faixa de 10 minutos. Chamada pela batida.';

-- security definer porque quem chama é a função de borda com a chave de serviço,
-- e a tabela tem RLS por cliente. Sem isto a escrita passaria pela política de
-- leitura e falharia em silêncio, que é o pior desfecho possível num diagnóstico:
-- a curva simplesmente não existiria e ninguém saberia por quê.
revoke all on function public.registrar_memoria(uuid, uuid, timestamptz, integer, integer, integer) from public, anon, authenticated;
