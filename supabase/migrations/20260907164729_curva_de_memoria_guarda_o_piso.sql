-- A curva de memória passa a guardar o PISO da faixa, e a idade do processo.
--
-- ── POR QUE ─────────────────────────────────────────────────────────────
-- A curva só guarda o pico, e com o pico sozinho não dá para responder a
-- pergunta que interessa: o aplicativo está VAZANDO memória, ou o coletor de
-- lixo está só deixando o heap crescer porque ainda há espaço?
--
-- As duas coisas desenham a mesma subida em degraus. O que as separa é o PISO:
-- num aplicativo saudável o heap volta ao mesmo lugar depois de cada coleta,
-- por mais alto que o pico tenha ido; num vazamento o piso sobe junto e nunca
-- mais desce.
--
-- MEDIDO no razr 007 do Interlagos (25/08): o pico subiu de 34 para 284 MB ao
-- longo do turno, em degraus que não voltavam. Parece vazamento. Só que os três
-- aparelhos com cota de 384 MB são exatamente os três de média mais alta (85, 55
-- e 49 MB) e os de cota 256 ficam entre 16 e 34 — heap que cresce na proporção
-- da COTA, e não do uso, é a assinatura do coletor com folga, não de vazamento.
-- Nenhuma das duas leituras dá para provar com o que a curva guarda hoje.
--
-- ── A IDADE DO PROCESSO ─────────────────────────────────────────────────
-- A curva do 007 despenca de 284 para 10 MB às 22:00 e de 226 para 27 às 16:30.
-- Não dá para saber se foi coleta de lixo, fim do expediente da loja ou o
-- aplicativo reiniciando: `uptime_seconds` conta desde que o APARELHO ligou, e
-- o processo pode ter morrido e voltado sem o aparelho reiniciar.
--
-- Uma queda com o processo velho é o coletor trabalhando. Uma queda com o
-- processo recém-nascido é o aplicativo tendo morrido, e aí é defeito.
alter table public.device_memoria
  add column if not exists heap_piso_mb integer,
  add column if not exists processo_segundos bigint;

comment on column public.device_memoria.heap_piso_mb is
  'Menor uso de memória visto na faixa. É o piso, e não o pico, que separa vazamento de folga do coletor.';
comment on column public.device_memoria.processo_segundos is
  'Há quantos segundos este processo do aplicativo está vivo, na última batida da faixa. Não é o uptime do aparelho.';

-- A função ganha os dois campos. Continua sendo uma escrita só por batida: o
-- `least` do piso e o `greatest` do pico resolvem no banco, sem leitura antes.
create or replace function public.registrar_memoria(
  p_device uuid,
  p_tenant uuid,
  p_faixa timestamptz,
  p_usado integer,
  p_teto integer,
  p_nativo integer,
  p_processo bigint default null
)
returns void
language sql
security definer
set search_path = ''
as $function$
  insert into public.device_memoria
    (device_id, tenant_id, faixa, heap_usado_mb, heap_teto_mb, heap_nativo_mb,
     heap_piso_mb, processo_segundos)
  values (p_device, p_tenant, p_faixa, p_usado, p_teto, p_nativo,
          p_usado, p_processo)
  on conflict (device_id, faixa) do update
    set heap_usado_mb  = greatest(public.device_memoria.heap_usado_mb, excluded.heap_usado_mb),
        heap_nativo_mb = greatest(public.device_memoria.heap_nativo_mb, excluded.heap_nativo_mb),
        heap_teto_mb   = excluded.heap_teto_mb,
        -- O piso pega o menor, e aceita faixa antiga sem piso gravado.
        heap_piso_mb   = least(
          coalesce(public.device_memoria.heap_piso_mb, excluded.heap_piso_mb),
          excluded.heap_piso_mb
        ),
        -- A idade do processo é a da ÚLTIMA batida da faixa, e não a menor:
        -- é ela que diz se o processo chegou vivo ao fim da faixa.
        processo_segundos = coalesce(excluded.processo_segundos,
                                     public.device_memoria.processo_segundos);
$function$;

comment on function public.registrar_memoria(uuid, uuid, timestamptz, integer, integer, integer, bigint) is
  'Guarda pico, piso e idade do processo na faixa de 10 minutos. Chamada pela batida.';

revoke all on function public.registrar_memoria(uuid, uuid, timestamptz, integer, integer, integer, bigint)
  from public, anon, authenticated;

-- A assinatura de seis argumentos sai de cena para não sobrar duas funções com o
-- mesmo nome. Nada quebra: quem chama é a função de borda, e uma chamada com os
-- seis argumentos antigos cai nesta mesma função pelo valor padrão do sétimo.
drop function if exists public.registrar_memoria(uuid, uuid, timestamptz, integer, integer, integer);
