-- LINKA - o toque no painel de recursos vira numero no relatorio.
--
-- O QUE ESTAVA ACONTECENDO. Desde 02/08 o aparelho grava um evento a cada toque
-- num recurso do painel ("feature_tap", com a chave do recurso). O evento entra
-- em device_events, e ali PARA: nenhum rollup o le, nenhuma view o mostra, e o
-- painel nao tem onde exibi-lo. Dado coletado e nao mostrado e pior que dado
-- nao coletado - ocupa espaco, sugere que a pergunta esta respondida, e nao
-- responde nada.
--
-- E e justamente o dado que separa este produto do incumbente. Ele tambem tem
-- botoes de demonstracao; o que ele nao sabe dizer e QUAL foi tocado. "382
-- clientes testaram a camera no Razr contra 41 no G06" orienta sortimento e
-- treinamento de loja, e nenhum concorrente entrega.
--
-- -- POR QUE UMA TABELA NOVA, E NAO UMA COLUNA EM rollup_recurso_hora --------
-- Sao duas perguntas diferentes e os numeros NAO se somam:
--
--   rollup_recurso_hora  = quanto tempo o cliente passou dentro de cada app.
--   rollup_toque_hora    = quantos quiseram experimentar cada recurso.
--
-- Quem abre a camera aparece nos dois - e tem que aparecer, porque um mede
-- tempo e o outro mede intencao. Brilho e volume nao abrem app nenhum e SO
-- existem aqui: sem esta tabela, o recurso mais mexido da loja fica invisivel.
-- Junta-las numa tabela so convidaria a somar sessoes com toques, e o primeiro
-- numero errado apareceria num relatorio ja entregue ao cliente.
--
-- -- O ROTULO E DADO, NAO CODIGO ---------------------------------------------
-- O aparelho manda a chave tecnica ("linka:camera"). Quem traduz para "Camera"
-- e o app_catalog, que ja existe exatamente para isso (pacote -> rotulo). Assim
-- renomear um recurso na tela do cliente e um UPDATE, nao uma versao nova do
-- aplicativo na frota inteira.
--
-- Recurso novo no APK que ainda nao tenha linha aqui NAO some: cai no
-- coalesce(label, package) e aparece como "linka:bluetooth". Feio de proposito -
-- a alternativa e o toque sumir em silencio, que e como se perde medicao.
--
-- -- O VIGIA NAO ENTRA NESTA -------------------------------------------------
-- O vigia_do_rollup cobra dia sem rollup, e para vitrine isso e defeito certo
-- (aparelho ligado sempre tem vitrine). Toque nao: um dia inteiro sem ninguem
-- encostar num aparelho e um dia normal de loja fraca, nao um dia com falha.
-- Cobrar toque ali faria o vigia gritar por dado legitimo - e alarme que grita
-- a toa e alarme que se aprende a ignorar. Fica de fora de proposito.

-- ---------------------------------------------------------------------------
-- 1. Os rotulos dos recursos do painel.
-- ---------------------------------------------------------------------------
-- category serve para o relatorio poder separar "o que o cliente pediu no nosso
-- menu" do uso de apps do sistema. is_noise = false: toque nunca e ruido, ele e
-- sempre uma acao deliberada de alguem com o aparelho na mao.
insert into public.app_catalog (package, label, category, is_noise) values
  ('linka:camera',  'Camera',         'Painel LINKA', false),
  ('linka:youtube', 'YouTube',        'Painel LINKA', false),
  ('linka:brilho',  'Brilho da tela', 'Painel LINKA', false),
  ('linka:volume',  'Som',            'Painel LINKA', false)
on conflict (package) do update
  set label = excluded.label, category = excluded.category, is_noise = excluded.is_noise;

-- ---------------------------------------------------------------------------
-- 2. Toques por recurso, aparelho e hora local.
-- ---------------------------------------------------------------------------
create table if not exists public.rollup_toque_hora (
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  device_id     uuid not null references public.devices (id) on delete cascade,
  hora_local    timestamp not null,
  -- O rotulo de negocio ("Camera"), igual as outras tabelas de rollup: e o que
  -- a marca le, e dois pacotes com o mesmo rotulo somam numa linha so.
  recurso       text not null,
  toques        integer not null default 0,
  atualizado_em timestamptz not null default now()
);

-- Chave por expressao para acompanhar as irmas, ainda que aqui nao haja coluna
-- anulavel: recurso vem do coalesce(label, package) e nunca e nulo.
create unique index if not exists rollup_toque_hora_chave
  on public.rollup_toque_hora (device_id, hora_local, recurso);

create index if not exists rollup_toque_hora_tenant
  on public.rollup_toque_hora (tenant_id, hora_local);

comment on table public.rollup_toque_hora is
  'Toques em recursos do painel do aparelho, por aparelho e hora local. Mede INTENCAO (quantos quiseram testar), nunca tempo - nao somar com rollup_recurso_hora. Preenchido por preencher_rollup_dia(). Ver migration 20260803010000.';

alter table public.rollup_toque_hora enable row level security;

-- Mesma politica das irmas: cada marca ve so o proprio dado.
drop policy if exists rollup_toque_select on public.rollup_toque_hora;
create policy rollup_toque_select on public.rollup_toque_hora
  for select to authenticated
  using (private.has_tenant_access(tenant_id));

-- ---------------------------------------------------------------------------
-- 3. preencher_rollup_dia passa a preencher as QUATRO, na mesma transacao.
-- ---------------------------------------------------------------------------
-- CIRURGIA NO QUE ESTA VIVO, e nao um corpo novo digitado aqui.
--
-- Reescrever a funcao inteira neste arquivo e o caminho curto e ja custou caro
-- neste projeto: o arquivo local descrevia um fleet_report com 4 parametros
-- enquanto o banco tinha um com 5, e uma reconstrucao teria criado duas copias.
-- Aqui a fonte da verdade e pg_get_functiondef, e a insercao so acontece se o
-- ponto de ancora existir - senao a migration falha alto, em vez de aplicar
-- pela metade.
do $cirurgia$
declare
  v_def   text;
  v_nova  text;
  v_delete_ancora constant text :=
    '  delete from public.rollup_midia_hora r' || E'\n' ||
    '  where r.hora_local >= v_dia::timestamp and r.hora_local < (v_dia + 1)::timestamp;';
  v_return_ancora constant text := E'\n  return v_linhas;';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'preencher_rollup_dia';

  if v_def is null then
    raise exception 'preencher_rollup_dia nao existe: nada a costurar';
  end if;

  if position('rollup_toque_hora' in v_def) > 0 then
    raise notice 'preencher_rollup_dia ja cobre toques; nada a fazer';
    return;
  end if;

  if position(v_delete_ancora in v_def) = 0 then
    raise exception 'ancora do delete mudou: revisar a costura antes de aplicar';
  end if;
  if position(v_return_ancora in v_def) = 0 then
    raise exception 'ancora do return mudou: revisar a costura antes de aplicar';
  end if;

  -- (a) o dia e sempre reconstruido do zero, igual as outras tres.
  v_nova := replace(
    v_def,
    v_delete_ancora,
    v_delete_ancora || E'\n' ||
    '  delete from public.rollup_toque_hora r' || E'\n' ||
    '  where r.hora_local >= v_dia::timestamp and r.hora_local < (v_dia + 1)::timestamp;'
  );

  -- (b) a contagem, antes do return.
  --
  -- Sem folga de dia e sem regra de ilha: um toque e um instante, nao um
  -- intervalo. Nao ha o que atravessar a meia-noite nem o que agrupar em visita
  -- - e por isso este bloco e o mais simples dos quatro.
  v_nova := replace(
    v_nova,
    v_return_ancora,
    E'\n' ||
    '  insert into public.rollup_toque_hora' || E'\n' ||
    '    (tenant_id, device_id, hora_local, recurso, toques)' || E'\n' ||
    '  select' || E'\n' ||
    '    e.tenant_id, e.device_id,' || E'\n' ||
    '    date_trunc(''hour'', (e.started_at at time zone coalesce(s.timezone, ''America/Sao_Paulo''))),' || E'\n' ||
    '    coalesce(c.label, e.package),' || E'\n' ||
    '    count(*)::int' || E'\n' ||
    '  from public.device_events e' || E'\n' ||
    '  join public.devices d on d.id = e.device_id' || E'\n' ||
    '  left join public.stores s on s.id = d.store_id' || E'\n' ||
    '  left join public.app_catalog c on c.package = e.package' || E'\n' ||
    '  where e.kind = ''feature_tap''' || E'\n' ||
    '    and e.package is not null' || E'\n' ||
    '    and not d.exclude_from_reports' || E'\n' ||
    '    and date_trunc(''hour'', (e.started_at at time zone coalesce(s.timezone, ''America/Sao_Paulo'')))' || E'\n' ||
    '        >= v_dia::timestamp' || E'\n' ||
    '    and date_trunc(''hour'', (e.started_at at time zone coalesce(s.timezone, ''America/Sao_Paulo'')))' || E'\n' ||
    '        <  (v_dia + 1)::timestamp' || E'\n' ||
    '  group by 1,2,3,4;' || E'\n' ||
    E'\n' ||
    '  get diagnostics v_extra = row_count;' || E'\n' ||
    '  v_linhas := v_linhas + v_extra;' || E'\n' ||
    v_return_ancora
  );

  execute v_nova;
end;
$cirurgia$;

-- ---------------------------------------------------------------------------
-- 4. Os dias que ja tem toque gravado entram agora.
-- ---------------------------------------------------------------------------
-- Sem isto, o relatorio comecaria a contar so a partir do proximo cron - e os
-- toques dos testes em aparelho, que sao a unica prova de que a medicao
-- funciona, ficariam de fora justamente da tela criada para mostra-los.
do $historico$
declare
  v_dia date;
begin
  for v_dia in
    select distinct date_trunc('day', (e.started_at at time zone coalesce(s.timezone, 'America/Sao_Paulo')))::date
    from public.device_events e
    join public.devices d on d.id = e.device_id
    left join public.stores s on s.id = d.store_id
    where e.kind = 'feature_tap'
    order by 1
  loop
    perform public.preencher_rollup_dia(v_dia);
  end loop;
end;
$historico$;

-- ---------------------------------------------------------------------------
-- 5. A view de BI, no mesmo formato das irmas.
-- ---------------------------------------------------------------------------
-- Mesmas dimensoes de v_bi_interaction_hourly (rede, loja, cidade, uf, tipo de
-- local, aparelho, modelo, linha) porque o BI da ProSolution cruza tudo pelas
-- mesmas colunas - view que inventa nome proprio obriga a mexer no BI para
-- ganhar um numero novo.
create or replace view public.v_bi_feature_taps_hourly
with (security_invoker = true) as
select
  r.tenant_id,
  ch.name as rede,
  s.name  as loja,
  s.city  as cidade,
  s.state as uf,
  case s.kind
    when 'shopping'::store_kind then 'Shopping'::text
    when 'street'::store_kind   then 'Rua'::text
    else 'Outro'::text
  end as tipo_local,
  d.code as codigo,
  d.name as aparelho,
  m.name as modelo,
  m.line as linha,
  r.hora_local,
  r.recurso,
  sum(r.toques)::bigint as toques
from public.rollup_toque_hora r
join public.devices d on d.id = r.device_id
left join public.device_models m on m.id = d.model_id
left join public.stores s on s.id = d.store_id
left join public.retail_chains ch on ch.id = s.chain_id
group by r.tenant_id, ch.name, s.name, s.city, s.state, s.kind,
         d.code, d.name, m.name, m.line, r.hora_local, r.recurso;

comment on view public.v_bi_feature_taps_hourly is
  'Toques por recurso do painel, hora local. Mede intencao (quantos quiseram testar), nunca tempo. Le rollup_toque_hora. Ver migration 20260803010000.';
