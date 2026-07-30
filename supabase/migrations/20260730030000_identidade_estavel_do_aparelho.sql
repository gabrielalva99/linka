-- LINKA — o aparelho passa a ter identidade que sobrevive a restauracao de fabrica.
--
-- O PROBLEMA. O provisionamento reconhece o aparelho pelo `android_id`, e o
-- `android_id` MUDA quando alguem restaura o aparelho de fabrica. Na loja isso
-- acontece: o cliente mexe, o promotor nao consegue destravar, alguem restaura.
--
-- O aparelho volta, se apresenta como numero novo, e o provisionamento cria um
-- REGISTRO NOVO. O antigo fica de fantasma — com o codigo da posicao, o historico
-- e a loja dele. Com 250 aparelhos, e o painel dizendo 260 quando existem 250, e
-- ninguem conseguindo apontar qual sobra.
--
-- ── Duas colunas, e a segunda e a que impede a mentira ─────────────────────
--
--   stable_id        - a identidade estavel
--   stable_id_source - de ONDE ela veio: esid | serial | android_id
--
-- A fonte nao e curiosidade tecnica. `android_id` como fonte significa
-- "identidade que se apaga no proximo reset": o painel precisa poder dizer isso,
-- em vez de tratar as tres como se fossem iguais. Identidade fraca sem aviso e a
-- mesma classe de defeito que esta varredura passou o dia consertando — dado que
-- parece firme e nao e.
--
-- ── Unico POR CLIENTE, e nao global ────────────────────────────────────────
-- O mesmo aparelho fisico pode legitimamente ser devolvido e reaproveitado em
-- outra marca. Unicidade global recusaria isso; unicidade por cliente reconhece o
-- retorno dentro da mesma conta, que e o caso que causa o fantasma.
--
-- Indice parcial (where not null) porque os aparelhos que ja estao na rua ainda
-- nao reportaram — eles aprendem pelo heartbeat, sem reprovisionar.

alter table public.devices
  add column if not exists stable_id text,
  add column if not exists stable_id_source text;

comment on column public.devices.stable_id is
  'Identidade que sobrevive a restauracao de fabrica. Preenchida pelo agente (heartbeat ou provisionamento).';
comment on column public.devices.stable_id_source is
  'De onde a identidade veio: esid (melhor, sobrevive ao reset) | serial | android_id (se apaga no reset).';

alter table public.devices
  drop constraint if exists devices_stable_id_source_valida;
alter table public.devices
  add constraint devices_stable_id_source_valida
  check (stable_id_source is null
         or stable_id_source in ('esid','serial','android_id'));

create unique index if not exists devices_tenant_stable_id
  on public.devices (tenant_id, stable_id)
  where stable_id is not null;

-- ── O que o painel precisa ver ─────────────────────────────────────────────
-- Aparelho cuja identidade se apaga no proximo reset. Nao e alarme de hoje: e a
-- lista de quem vai virar fantasma quando alguem restaurar.
create or replace view public.v_identidade_fraca
  with (security_invoker = on) as
select d.tenant_id, d.id as device_id, d.code, d.name,
       coalesce(d.stable_id_source, 'nao reportou') as fonte,
       s.name as loja
from public.devices d
left join public.stores s on s.id = d.store_id
where d.is_active
  and (d.stable_id is null or d.stable_id_source = 'android_id');

comment on view public.v_identidade_fraca is
  'Aparelhos em operacao cuja identidade nao sobrevive a restauracao de fabrica (ou que ainda nao reportaram identidade). Cada linha aqui e um fantasma em potencial na frota.';

grant select on public.v_identidade_fraca to authenticated;
