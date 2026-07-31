-- LINKA — corrige uma negacao dupla invertida, introduzida por mim na migration
-- anterior e pega minutos depois, conferindo a saida.
--
-- O QUE EU ESCREVI:
--     coalesce(protecao_de_pe(protecoes), NOT kiosk_locked) = false
--
-- Para aparelho que ainda nao sabe reportar (protecoes nulo) isso vira
-- coalesce(null, not true) = false -> VERDADEIRO. Ou seja: acusava justamente
-- quem esta com as travas aplicadas. Medido segundos depois do deploy: o 663E,
-- dono do aparelho e travado, apareceu como "sem travas".
--
-- A CAUSA. Os dois ramos de um coalesce tem que responder a MESMA pergunta.
-- protecao_de_pe responde "a protecao esta de pe?"; `not kiosk_locked` responde o
-- oposto. Um dos dois estava de cabeca para baixo.
--
-- O TAMANHO DO ESTRAGO EVITADO. A frota inteira fica com protecoes nulo ate se
-- atualizar, entao isto teria aceso alarme falso em TODOS os aparelhos — que e
-- exatamente o defeito que a migration anterior existe para fechar, reintroduzido
-- pela propria correcao dele. Aviso que grita sem motivo ensina a ignorar aviso.
--
-- Achado porque a saida foi conferida caso a caso, e nao porque o deploy disse
-- "aplicado com sucesso". As cinco situacoes, verificadas depois da correcao:
--   agente novo, tudo de pe .......... sem aviso
--   agente antigo, travado ........... sem aviso
--   agente antigo, destravado ........ avisa, com a mensagem antiga
--   agente novo, uma trava caida ..... avisa, dizendo qual
--   nao e dono do aparelho ........... avisa, dizendo isso
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
  -- Os dois ramos do coalesce respondem a MESMA pergunta: "a protecao esta de
  -- pe?". Aparelho que sabe reportar responde com a prova; o que ainda nao sabe
  -- responde com kiosk_locked, que ao menos e verificado no aparelho.
  (not comh.is_device_owner
     or coalesce(public.protecao_de_pe(comh.protecoes), comh.kiosk_locked) = false,
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

alter view public.v_device_issues set (security_invoker = on);
