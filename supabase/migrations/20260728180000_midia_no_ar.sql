-- LINKA — qual vídeo estava na tela naquela hora.
--
-- Este dado NÃO EXISTIA. `devices.playing_url` é estado atual: o aparelho
-- sobrescreve a cada batida e o valor anterior desaparece para sempre. Dava para
-- saber o que está no ar agora e nada sobre ontem.
--
-- E não dá para reconstruir depois. O rodízio é derivado do relógio, então em
-- tese o item da vez é calculável — até alguém mexer na playlist, que reescreve
-- retroativamente a resposta de todos os dias anteriores. Reconstrução que muda
-- quando o cadastro muda não é medição, é chute com aparência de número.
--
-- Por isso vira EVENTO gravado, com o mesmo desenho idempotente do resto: o
-- aparelho manda "este vídeo ficou no ar deste instante até este", reenvio não
-- duplica, e a rede da loja pode cair à vontade.
--
-- É o que liga conteúdo a comportamento: com o instante em que a pessoa pegou o
-- aparelho e o instante de cada vídeo, "qual vídeo faz o cliente parar" deixa de
-- ser opinião de reunião.

alter table public.device_events
  add column media_id   uuid references public.media_assets (id) on delete set null,
  -- O nome fica gravado junto de propósito. Apagar um vídeo da biblioteca não
  -- pode apagar a história de desempenho dele: sem isto, excluir um arquivo
  -- transformaria meses de relatório em linhas sem nome.
  add column media_name text;

comment on column public.device_events.media_id is 'Vídeo no ar no período do evento (kind = media_play).';
comment on column public.device_events.media_name is 'Nome do vídeo no momento em que tocou — sobrevive à exclusão do arquivo.';

create index device_events_media on public.device_events (media_id, started_at desc)
  where media_id is not null;

/**
 * Recorte de um período em fatias de hora, no fuso da loja e dentro do
 * expediente.
 *
 * Existe porque a conta estava errada e ninguém veria: uma sessão de vitrine que
 * começa 13h50 e termina 16h20 era lançada INTEIRA na hora 13. O gráfico por
 * hora mostrava um pico às 13h e deserto às 14h e 15h — e, pior, a taxa de
 * parada das horas seguintes ficava sem denominador (visita sem exposição =
 * divisão por zero).
 *
 * Fica em função, e não copiado em cada view, porque "recortar por hora e por
 * expediente" é uma regra só. Duas cópias viram duas regras no dia em que uma
 * for corrigida.
 */
create function public.slice_hours(
  p_started timestamptz,
  p_ended   timestamptz,
  p_tz      text,
  p_abre    time,
  p_fecha   time
)
returns table (hora_local timestamp, segundos integer)
language sql
stable
set search_path = public
as $$
  select
    h,
    greatest(0, extract(epoch from (
      least(p_ended at time zone p_tz, h + interval '1 hour', h::date + p_fecha)
      - greatest(p_started at time zone p_tz, h, h::date + p_abre)
    )))::int
  from generate_series(
    date_trunc('hour', p_started at time zone p_tz),
    -- greatest() protege o caso degenerado (fim = início), em que a série
    -- sairia vazia e o período sumiria da conta.
    greatest(
      date_trunc('hour', p_started at time zone p_tz),
      date_trunc('hour', (p_ended at time zone p_tz) - interval '1 microsecond')
    ),
    interval '1 hour'
  ) h
$$;

comment on function public.slice_hours is 'Divide um período em horas locais, cortado pelo expediente da loja. Devolve zero segundos para a fatia fora do expediente.';

/**
 * Visita: um bloco de uso do cliente, com início e fim.
 *
 * Passa a existir sozinha porque a mesma definição estava copiada em três
 * lugares (view do BI, jornada do aparelho, relatório). Três cópias de "o que
 * conta como uma visita" é como o total deixa de bater com a soma das partes —
 * e agora surge um quarto consumidor, a atribuição por vídeo, que PRECISA do
 * instante exato em que a visita começou.
 */
create view public.v_visits with (security_invoker = true) as
with uso as (
  select
    e.tenant_id,
    e.device_id,
    e.started_at,
    e.ended_at,
    coalesce(e.duration_seconds, 0) as segundos,
    case
      when e.kind = 'showcase' then 1
      when lag(e.ended_at) over (partition by e.device_id order by e.started_at) is null
        or e.started_at - lag(e.ended_at) over (partition by e.device_id order by e.started_at)
           > interval '90 seconds'
      then 1 else 0
    end as nova,
    e.kind::text as kind
  from public.device_events e
  join public.devices d on d.id = e.device_id
  left join public.app_catalog c on c.package = e.package
  where e.kind in ('app_usage', 'showcase')
    and (e.kind <> 'app_usage' or coalesce(c.is_noise, false) = false)
    and not d.exclude_from_reports
),
ilhas as (
  select *,
    sum(nova) over (
      partition by device_id order by started_at rows unbounded preceding
    ) as visita
  from uso
)
select
  tenant_id,
  device_id,
  visita,
  min(started_at) as inicio,
  max(coalesce(ended_at, started_at)) as fim,
  sum(segundos)   as segundos
from ilhas
where kind = 'app_usage'
group by 1, 2, 3;

comment on view public.v_visits is 'Uma linha por visita, com o instante de início. Definição única de visita — todo o resto lê daqui.';

-- Passa a ler da definição única. O número não muda; o risco de ele passar a
-- mudar sozinho, sim.
drop view if exists public.v_bi_visits_hourly;
create view public.v_bi_visits_hourly with (security_invoker = true) as
select
  v.tenant_id,
  ch.name as rede,
  s.name  as loja,
  s.city  as cidade,
  s.state as uf,
  case s.kind
    when 'shopping' then 'Shopping'
    when 'street'   then 'Rua'
    else 'Outro'
  end     as tipo_local,
  d.code  as codigo,
  d.name  as aparelho,
  m.name  as modelo,
  m.line  as linha,
  date_trunc('hour', v.inicio at time zone coalesce(s.timezone, 'America/Sao_Paulo')) as hora_local,
  count(*)        as visitas,
  sum(v.segundos) as segundos_uso
from public.v_visits v
join public.devices d on d.id = v.device_id
left join public.device_models m on m.id = d.model_id
left join public.stores s on s.id = d.store_id
left join public.retail_chains ch on ch.id = s.chain_id
group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11;

comment on view public.v_bi_visits_hourly is 'BI: quantas pessoas pararam no aparelho e por quanto tempo, por modelo/linha. Aparelho de teste fica de fora.';

-- Vitrine agora fatiada por hora de verdade (ver slice_hours). Antes uma sessão
-- longa inflava a hora em que começou e zerava as seguintes.
drop view if exists public.v_bi_showcase_hourly;
create view public.v_bi_showcase_hourly with (security_invoker = true) as
select
  e.tenant_id,
  ch.name as rede,
  s.name  as loja,
  s.city  as cidade,
  s.state as uf,
  case s.kind
    when 'shopping' then 'Shopping'
    when 'street'   then 'Rua'
    else 'Outro'
  end     as tipo_local,
  d.code  as codigo,
  d.name  as aparelho,
  m.name  as modelo,
  m.line  as linha,
  f.hora_local,
  sum(f.segundos) as segundos_vitrine
from public.device_events e
join public.devices d on d.id = e.device_id
left join public.device_models m on m.id = d.model_id
left join public.stores s on s.id = d.store_id
left join public.retail_chains ch on ch.id = s.chain_id
cross join lateral public.slice_hours(
  e.started_at,
  coalesce(e.ended_at, e.started_at + make_interval(secs => coalesce(e.duration_seconds, 0))),
  coalesce(s.timezone, 'America/Sao_Paulo'),
  coalesce(s.opens_at, '09:00'),
  coalesce(s.closes_at, '22:00')
) f
where e.kind = 'showcase'
  and not d.exclude_from_reports
  and f.segundos > 0
group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11;

comment on view public.v_bi_showcase_hourly is 'BI: tempo com a vitrine na tela, por hora local e dentro do expediente. É o denominador da taxa de parada.';

/**
 * A tabela que responde a pergunta de conteúdo: cada vídeo, quanto tempo ficou
 * no ar e quantas pessoas pararam ENQUANTO ele estava no ar.
 *
 * A atribuição é pelo instante em que a visita começou — é o vídeo que estava
 * na tela quando a pessoa decidiu pegar o aparelho. O que ela faz depois é
 * mérito do aparelho, não do vídeo.
 *
 * A taxa (visitas por hora de exibição) não vai na view de propósito: dividir
 * antes de agregar dá média de médias, que está errada. Quem divide é quem
 * agrega, no fim.
 */
create view public.v_bi_media_hourly with (security_invoker = true) as
with segmentos as (
  select
    e.id,
    e.tenant_id,
    e.device_id,
    coalesce(mm.name, e.media_name, 'mídia removida') as midia,
    e.started_at,
    coalesce(e.ended_at, e.started_at + make_interval(secs => coalesce(e.duration_seconds, 0))) as ended_at,
    coalesce(s.timezone, 'America/Sao_Paulo') as tz,
    coalesce(s.opens_at, '09:00')  as abre,
    coalesce(s.closes_at, '22:00') as fecha
  from public.device_events e
  join public.devices d on d.id = e.device_id
  left join public.stores s on s.id = d.store_id
  left join public.media_assets mm on mm.id = e.media_id
  where e.kind = 'media_play'
    and not d.exclude_from_reports
),
no_ar as (
  select g.tenant_id, g.device_id, g.midia, f.hora_local, sum(f.segundos) as segundos
  from segmentos g
  cross join lateral public.slice_hours(g.started_at, g.ended_at, g.tz, g.abre, g.fecha) f
  where f.segundos > 0
  group by 1, 2, 3, 4
),
-- A visita entra na hora em que ELA começou, e no vídeo que estava no ar
-- naquele instante — que pode ter começado na hora anterior.
paradas as (
  select
    g.tenant_id,
    g.device_id,
    g.midia,
    date_trunc('hour', v.inicio at time zone g.tz) as hora_local,
    count(*)        as visitas,
    sum(v.segundos) as segundos_uso
  from public.v_visits v
  join segmentos g
    on g.device_id = v.device_id
   and v.inicio >= g.started_at
   and v.inicio <  g.ended_at
  group by 1, 2, 3, 4
)
select
  coalesce(n.tenant_id, p.tenant_id) as tenant_id,
  ch.name as rede,
  s.name  as loja,
  s.city  as cidade,
  s.state as uf,
  case s.kind
    when 'shopping' then 'Shopping'
    when 'street'   then 'Rua'
    else 'Outro'
  end     as tipo_local,
  d.code  as codigo,
  d.name  as aparelho,
  mo.name as modelo,
  mo.line as linha,
  coalesce(n.hora_local, p.hora_local) as hora_local,
  coalesce(n.midia, p.midia)           as midia,
  coalesce(n.segundos, 0)      as segundos_no_ar,
  coalesce(p.visitas, 0)       as visitas,
  coalesce(p.segundos_uso, 0)  as segundos_uso
from no_ar n
full join paradas p
  on p.device_id = n.device_id and p.midia = n.midia and p.hora_local = n.hora_local
join public.devices d on d.id = coalesce(n.device_id, p.device_id)
left join public.device_models mo on mo.id = d.model_id
left join public.stores s on s.id = d.store_id
left join public.retail_chains ch on ch.id = s.chain_id;

comment on view public.v_bi_media_hourly is 'BI: desempenho de cada vídeo — tempo no ar e visitas que começaram com ele na tela. Taxa de parada = visitas ÷ horas no ar, calculada depois de agregar.';
