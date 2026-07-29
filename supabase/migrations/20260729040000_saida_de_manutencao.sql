-- LINKA — saida do quiosque na loja, sem cabo e sem notebook.
--
-- O PROBLEMA. Desde que a trava de quiosque virou real (lock task, agente
-- 0.37.0), o aparelho na vitrine nao tem mais saida presencial. Quem esta na
-- loja para trocar o aparelho de posicao, conferir uma reclamacao ou levar o
-- aparelho embora depende do painel — ou seja, depende de alguem no escritorio,
-- com internet, no mesmo minuto. Numa loja a 40 km isso e uma visita tecnica
-- por causa de um toque.
--
-- A ESCOLHA DO SEGREDO. PIN por CLIENTE, com override por aparelho.
--
--   Por cliente porque a equipe de campo precisa de um numero que ela decore.
--   Um PIN por aparelho, com 250 aparelhos, viraria uma planilha que ninguem
--   leva para a loja — e planilha esquecida em casa e o mesmo que nao ter saida.
--
--   Override por aparelho porque um aparelho de vitrine premium pode merecer
--   segredo proprio, e porque e o caminho de revogar UM aparelho sem trocar o
--   PIN da rede inteira.
--
-- O QUE ISTO NAO E. Nao e um segredo forte, e o codigo do agente diz isso na
-- cara: seis digitos se quebram por tentativa se alguem tiver a tela do
-- aparelho e tempo. A protecao de verdade nao e o PIN, sao as tres coisas em
-- volta dele:
--
--   1. o agente guarda so o HASH (a funcao agent-content manda ja com hash), de
--      modo que o numero em si nunca fica escrito no aparelho;
--   2. toda saida vira registro em audit_log — sem trilha, "alguem destravou"
--      seria indistinguivel de "o aparelho falhou sozinho";
--   3. a saida se fecha sozinha em 5 minutos. Porta de manutencao esquecida
--      aberta e pior do que porta nenhuma, porque cria a sensacao de que a
--      vitrine esta protegida quando nao esta.
--
-- Seis digitos, nao quatro: quatro tem 10 mil combinacoes e o bloqueio local de
-- 3 tentativas nao segura quem tem a tarde inteira. Seis com bloqueio e
-- suficiente para o que esta em jogo (destravar um aparelho de demonstracao).

alter table public.tenants
  add column if not exists maintenance_pin text;

alter table public.devices
  add column if not exists maintenance_pin text;

comment on column public.tenants.maintenance_pin is
  'PIN de manutencao do cliente (6 a 8 digitos). Vale para todos os aparelhos dele. Nulo = sem saida presencial.';
comment on column public.devices.maintenance_pin is
  'PIN so deste aparelho. Quando preenchido, ignora o do cliente. Serve para revogar um aparelho sem trocar o PIN da rede.';

-- Digito e comprimento validados no banco: PIN com letra ou com 3 digitos
-- chegaria ao aparelho e falharia na loja, onde nao tem ninguem para depurar.
alter table public.tenants
  drop constraint if exists tenants_maintenance_pin_formato;
alter table public.tenants
  add constraint tenants_maintenance_pin_formato
  check (maintenance_pin is null or maintenance_pin ~ '^[0-9]{6,8}$');

alter table public.devices
  drop constraint if exists devices_maintenance_pin_formato;
alter table public.devices
  add constraint devices_maintenance_pin_formato
  check (maintenance_pin is null or maintenance_pin ~ '^[0-9]{6,8}$');

-- ── Trilha da saida ────────────────────────────────────────────────────────
--
-- Vai para audit_log, e nao para device_events: device_events e medicao de uso,
-- particionada e resumida em rollups para o BI. Saida de manutencao e fato de
-- auditoria — raro, precisa durar, e ninguem quer ver isso somado a visita de
-- cliente num grafico de vendas.
--
-- actor_id fica nulo de proposito: quem agiu foi o aparelho, nao um usuario do
-- painel. Por isso a funcao e SECURITY DEFINER e recebe o device_id ja validado
-- pelo device_token na Edge Function — o agente nunca escreve direto na tabela.
create or replace function public.registrar_saida_manutencao(
  p_device_id uuid,
  p_detalhe text default null
) returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_tenant uuid;
  v_nome   text;
  v_loja   text;
begin
  select d.tenant_id, d.name, s.name
    into v_tenant, v_nome, v_loja
  from public.devices d
  left join public.stores s on s.id = d.store_id
  where d.id = p_device_id;

  if v_tenant is null then return; end if;

  insert into public.audit_log (actor_id, tenant_id, action, entity, entity_id, metadata)
  values (
    null, v_tenant, 'saida_de_manutencao', 'device', p_device_id,
    jsonb_build_object(
      'aparelho', v_nome,
      'loja', coalesce(v_loja, 'sem loja'),
      'detalhe', coalesce(p_detalhe, 'PIN correto na tela do aparelho')
    )
  );
end; $fn$;

revoke all on function public.registrar_saida_manutencao(uuid, text) from public, anon, authenticated;
