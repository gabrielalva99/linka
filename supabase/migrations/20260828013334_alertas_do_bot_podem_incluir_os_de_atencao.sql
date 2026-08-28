-- O bot passa a poder pedir tambem os alertas de atencao.
--
-- ── O QUE APARECEU NO PRIMEIRO TESTE ───────────────────────────────────────
-- O 114 caiu o Wi-Fi as 22h30 e nao apareceu em /alertas. Causa: `fora_do_ar`
-- so e critico com a LOJA ABERTA, e as 22h30 a loja de teste (horario padrao,
-- 9h as 22h) ja tinha fechado. Virou "atencao" e a lista, que so devolvia
-- critico, ignorou.
--
-- A regra esta certa e fica: ninguem quer ser chamado as 23h por aparelho que
-- so vai ser olhado de manha. O que faltava era o bot poder VER o resto quando
-- quiser, sem que isso vire mensagem para a loja.
--
-- Dois parametros, com o padrao mantendo o comportamento de antes:
--   p_incluir_atencao -> traz tambem o que nao e urgente agora
--   p_loja            -> filtra por codigo de loja, util para testar numa so
--
-- E a gravidade passa a vir em cada linha. Sem ela o bot recebia uma lista
-- misturada e nao tinha como decidir o que merece mensagem e o que e so
-- acompanhamento.
drop function if exists public.alertas_para_o_bot();

create or replace function public.alertas_para_o_bot(
  p_incluir_atencao boolean default false,
  p_loja text default null
)
returns table(
  alert_id       uuid,
  tenant_id      uuid,
  cliente        text,
  loja           text,
  loja_codigo    text,
  aparelho       text,
  aparelho_nome  text,
  tipo           text,
  rotulo         text,
  detalhe        text,
  gravidade      text,
  aberto_desde   timestamptz,
  minutos_aberto integer,
  loja_aberta    boolean,
  ja_respondido  boolean,
  avisar         jsonb
)
language sql
security definer
set search_path to 'public'
as $$
  select a.id, a.tenant_id, t.name,
         coalesce(s.name, 'sem loja'), s.code,
         d.code, d.name,
         a.kind, public.rotulo_do_alerta(a.kind), i.detalhe,
         i.gravidade,
         a.opened_at,
         greatest(1, (extract(epoch from now() - a.opened_at) / 60)::integer),
         i.aberta,
         exists (select 1 from public.alerta_triagem g where g.alert_id = a.id),
         case when d.store_id is null then '[]'::jsonb
              else public.quem_avisar(d.store_id) end
  from public.device_alerts a
  join public.devices d  on d.id = a.device_id
  join public.tenants t  on t.id = a.tenant_id
  left join public.stores s on s.id = d.store_id
  join public.v_device_issues i
    on i.device_id = a.device_id and i.tipo = a.kind
  where a.closed_at is null
    and (i.gravidade = 'critico' or p_incluir_atencao)
    and (p_loja is null or s.code = p_loja)
  -- Critico primeiro: numa lista misturada, o que precisa de gente agora nao
  -- pode ficar embaixo do que pode esperar ate amanha.
  order by (i.gravidade = 'critico') desc, a.opened_at;
$$;

comment on function public.alertas_para_o_bot(boolean, text) is
  'Alertas abertos para o bot. Por padrao so os criticos AGORA; p_incluir_atencao traz o resto, e p_loja filtra por codigo de loja.';

revoke all on function public.alertas_para_o_bot(boolean, text) from public, anon, authenticated;
