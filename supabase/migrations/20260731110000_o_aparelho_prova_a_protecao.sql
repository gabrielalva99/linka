-- LINKA — o painel para de deduzir proteção e passa a receber a prova.
--
-- COMO ESTAVA. Para decidir se um aparelho estava protegido, o relatório fazia:
--
--     d.block_settings and coalesce(d.blocked_apps,'') like '%vending%'
--
-- Os dois pedaços são prova indireta:
--   · `block_settings` é o INTERRUPTOR QUE O OPERADOR LIGOU no painel. Diz o que
--     foi pedido, nunca o que o aparelho conseguiu aplicar.
--   · `blocked_apps` é texto livre lido com `like`.
--
-- E a proteção que de fato segura o aparelho não estava em nenhum dos dois. É a
-- restrição que impede criar senha de tela: sem ela o cliente põe um PIN e a
-- vitrine morre no próximo reinício, sem cura neste hardware. Ela só aparecia em
-- texto solto, quando alguém disparava a sondagem à mão.
--
-- Pior, e medido no código do agente: ao aplicar as travas, ele acrescentava
-- "senha de tela" à lista de efetivos SEM conferir se a trava entrou — o catch do
-- laço é mudo de propósito. Um fabricante que recusasse a restrição produziria um
-- aparelho desprotegido relatando proteção. A prova indireta não era só fraca:
-- ela mentia, e mentia para o lado tranquilizador.
--
-- COMO FICA. O aparelho manda, a cada batida, o estado real de cada trava,
-- perguntado ao Android na hora. A LISTA DO QUE EXISTE MORA SÓ NO AGENTE — que é
-- o único capaz de aplicar as travas, e portanto o único que sabe quais são. Aqui
-- não há nome de trava escrito em lugar nenhum: a pergunta é sempre "sobrou algum
-- falso?".
--
-- Isso é o que fecha o defeito de verdade. O aviso que gritou por dois dias com
-- os aparelhos protegidos nasceu de a mesma decisão estar escrita em dois lugares
-- — o agente trocou de proteção e o relatório continuou exigindo a antiga. Com a
-- lista num lugar só, trocar de proteção não tem mais como quebrar o relatório.

alter table public.devices
  add column if not exists protecoes jsonb,
  add column if not exists protecoes_at timestamptz;

comment on column public.devices.protecoes is
  'Estado real de cada trava, perguntado ao Android pelo aparelho. {"no_config_credentials": true, ...}. Nulo = agente antigo, que nao sabe reportar. A lista do que existe mora no agente. Ver migration 20260731110000.';

-- ---------------------------------------------------------------------------
-- A regra, num lugar so.
-- ---------------------------------------------------------------------------
--
-- Duas funcoes minusculas em vez da condicao repetida na view e no relatorio. Foi
-- exatamente a condicao repetida que produziu o aviso mentiroso; escreve-la duas
-- vezes de novo seria repetir o erro com dado melhor.

create or replace function public.protecao_de_pe(p jsonb)
returns boolean language sql immutable as $function$
  -- Nulo ou vazio = o aparelho nao sabe dizer (agente antigo, ou nao e dono).
  -- Devolve NULO, e nao falso: "nao sei" nao pode virar acusacao, e tambem nao
  -- pode virar "esta tudo bem".
  select case
    when p is null or p = '{}'::jsonb then null
    else not exists (
      select 1 from jsonb_each(p) as t(chave, valor) where valor = 'false'::jsonb
    )
  end;
$function$;

comment on function public.protecao_de_pe(jsonb) is
  'Toda trava que o aparelho deveria ter esta de pe? Nulo = ele nao sabe dizer. Nao conhece nome de trava nenhum, de proposito.';

create or replace function public.protecoes_faltando(p jsonb)
returns text language sql immutable as $function$
  -- Os nomes vem do proprio aparelho; aqui so traduzimos para quem le a tela, e
  -- nome desconhecido aparece cru em vez de sumir. Trava nova no agente vira
  -- texto feio no painel — que e visivel, e portanto corrigivel. Escondida, ela
  -- viraria um aparelho desprotegido com painel calmo.
  select string_agg(
    case t.chave
      when 'no_config_credentials' then 'permite criar senha de tela'
      when 'no_factory_reset'      then 'permite restaurar de fabrica'
      when 'no_safe_boot'          then 'permite modo de seguranca'
      when 'no_add_user'           then 'permite criar outro usuario'
      when 'no_modify_accounts'    then 'permite adicionar conta'
      when 'no_config_date_time'   then 'permite mudar a hora'
      when 'no_config_locale'      then 'permite mudar o idioma'
      when 'no_config_wifi'        then 'permite mexer no Wi-Fi'
      when 'no_change_wifi_state'  then 'permite desligar o Wi-Fi'
      when 'no_add_wifi_config'    then 'permite trocar de rede'
      when 'no_airplane_mode'      then 'permite ligar o modo aviao'
      when 'escondido:com.android.vending' then 'Play Store ao alcance'
      else t.chave
    end, '; ' order by t.chave)
  from jsonb_each(p) as t(chave, valor)
  where valor = 'false'::jsonb;
$function$;

comment on function public.protecoes_faltando(jsonb) is
  'O que esta faltando, em portugues de tela. Trava que o painel ainda nao conhece sai com o nome cru — visivel e corrigivel, em vez de sumir.';

-- ---------------------------------------------------------------------------
-- As pendencias passam a acusar o que o aparelho PROVOU, e a dizer o que falta.
-- ---------------------------------------------------------------------------
create or replace view public.v_device_issues as
with base as (
  select
    d.id as device_id, d.tenant_id, d.code, d.name, d.exclude_from_reports,
    d.store_id, s.name as loja,
    coalesce(s.timezone, 'America/Sao_Paulo') as tz,
    coalesce(s.opens_at, '09:00'::time) as abre,
    coalesce(s.closes_at, '22:00'::time) as fecha,
    d.last_seen_at, d.playing_url, d.is_device_owner, d.kiosk_locked,
    d.screen_lock_set, d.update_error, d.battery_level, d.battery_charging,
    d.temperature_c, d.protecoes,
    make_interval(secs => t.tolerancia_sem_contato_segundos) as tolerancia
  from public.devices d
  left join public.stores s on s.id = d.store_id
  join public.tenants t on t.id = d.tenant_id
  where d.is_active
), comh as (
  select base.*,
    (now() at time zone base.tz)::time >= base.abre
      and (now() at time zone base.tz)::time <= base.fecha as aberta
  from base
)
select
  comh.device_id, comh.tenant_id, comh.code, comh.name, comh.loja, comh.store_id,
  comh.exclude_from_reports, comh.aberta, t.tipo, t.gravidade, t.detalhe
from comh,
lateral (values
  (comh.last_seen_at is null or comh.last_seen_at < (now() - comh.tolerancia),
   'fora_do_ar',
   case when comh.aberta then 'critico' else 'atencao' end,
   case when comh.last_seen_at is null then 'nunca se conectou'
        else 'sem contato ha ' ||
             greatest(1, (extract(epoch from now() - comh.last_seen_at) / 60)::integer) || ' min'
   end),
  (comh.last_seen_at >= (now() - comh.tolerancia) and comh.playing_url is null,
   'tela_vazia',
   case when comh.aberta then 'critico' else 'atencao' end,
   'no ar, mas sem video na tela'),
  -- SEM TRAVAS, agora com nome e sobrenome.
  --
  -- Antes dizia sempre a mesma frase de catalogo ("da para desligar o Wi-Fi ou
  -- ligar o modo aviao"), fosse qual fosse o problema — inclusive quando o
  -- problema era outro. Agora sai o que o aparelho relatou faltando.
  --
  -- Aparelho que ainda nao sabe reportar (agente antigo) cai na regra velha, que
  -- ao menos e verificada: sem essa saida, a frota inteira ficaria sem aviso
  -- nenhum ate a ultima loja se atualizar.
  (not comh.is_device_owner
     or coalesce(public.protecao_de_pe(comh.protecoes), not comh.kiosk_locked) = false,
   'sem_travas', 'atencao',
   case
     when not comh.is_device_owner then 'o aplicativo nao esta no controle do aparelho'
     when comh.protecoes is not null then
       coalesce(public.protecoes_faltando(comh.protecoes), 'protecao incompleta')
     else 'da para desligar o Wi-Fi ou ligar o modo aviao'
   end),
  (coalesce(comh.screen_lock_set, false),
   'senha_de_tela', 'atencao',
   'tem senha na tela de bloqueio; no proximo reinicio a vitrine para'),
  (comh.update_error is not null,
   'atualizacao_travada', 'atencao', coalesce(comh.update_error, '')),
  (comh.battery_level is not null and comh.battery_level < 15
     and not coalesce(comh.battery_charging, false),
   'bateria_baixa', 'atencao', comh.battery_level || '% e fora da tomada'),
  (comh.temperature_c is not null and comh.temperature_c >= 45,
   'quente', 'atencao', round(comh.temperature_c, 1) || ' °C'),
  (comh.store_id is null,
   'sem_loja', 'atencao', 'sem loja definida, nenhuma campanha alcanca este aparelho')
) t(vale, tipo, gravidade, detalhe)
where t.vale;

-- `create or replace view` NAO preserva security_invoker. Sem esta linha a view
-- volta a passar por cima do RLS e entrega aparelho de um cliente para outro.
alter view public.v_device_issues set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- O relatorio para de perguntar ao interruptor e passa a perguntar ao aparelho.
-- ---------------------------------------------------------------------------
--
-- Trocamos a condicao INTEIRA de `corrigido`. O que estava errado nao era o texto
-- que ela procurava — era ela estar perguntando a quem nao sabe a resposta.
--
-- Aparelho que ainda nao sabe reportar cai na regra antiga (protecao_de_pe
-- devolve nulo, e o coalesce cai para o criterio velho): sem essa saida, todo
-- aviso ficaria "aberto" ate a ultima loja se atualizar — a mesma classe de
-- alarme falso que este arquivo existe para fechar.
--
-- TROCA CIRURGICA, E NAO RECOPIA. O relatorio tem ~170 linhas; recopia-lo para
-- mexer numa e como as duas versoes se separam. Aqui a definicao publicada e
-- lida do proprio banco e so este trecho e substituido — e se ele nao for
-- encontrado exatamente, a migration FALHA em vez de aplicar pela metade. Um
-- replace que nao encontra nada tem sucesso silencioso, que e o pior desfecho:
-- diria "aplicado" e deixaria o relatorio mentindo igual.
do $migr$
declare
  v_def text;
  v_antigo constant text :=
    $a$bool_and(d.block_settings and coalesce(d.blocked_apps,'') like '%vending%') as corrigido$a$;
  v_novo constant text :=
    $n$bool_and(coalesce(public.protecao_de_pe(d.protecoes), d.block_settings and coalesce(d.blocked_apps,'') like '%vending%')) as corrigido$n$;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fleet_report';

  if v_def is null then
    raise exception 'fleet_report nao existe';
  end if;
  -- Ja aplicado: sai quieto. Migration que so funciona uma vez e uma armadilha
  -- para quem for restaurar o banco do zero.
  if position(v_novo in v_def) > 0 then
    return;
  end if;
  if position(v_antigo in v_def) = 0 then
    raise exception 'o trecho do corrigido mudou de forma - conferir antes de trocar';
  end if;

  execute replace(v_def, v_antigo, v_novo);
end $migr$;
