-- LINKA — o ritmo da batida passa a ser ajustavel sem novo APK.
--
-- POR QUE AGORA. Com o push cobrindo comando E conteudo, a batida deixou de ser o
-- caminho do que e urgente. Sobrou para ela um papel so: "esta loja esta no ar?".
-- Esse papel aguenta ser lento — ninguem fica parado na frente do aparelho
-- esperando a resposta dele. Espacar de 60s para 5 min derruba a conta da frota de
-- ~US$45 para ~US$10 por mes, e a 10 mil aparelhos e a diferenca entre 432 milhoes
-- e 86 milhoes de chamadas.
--
-- POR QUE UM AJUSTE, E NAO UM NUMERO NOVO NO APK. Se o numero morar no aplicativo,
-- descobrir que 5 min e demais (ou de menos) custa uma versao nova e uma volta na
-- frota inteira. Aqui e um valor no banco: muda na hora, volta atras na hora, e
-- chega aos aparelhos pelo proprio push. E o mesmo desenho de volume, faxina e
-- retorno automatico — comportamento vem do servidor.
--
-- FICA EM 60s NESTE ARQUIVO, DE PROPOSITO. Primeiro a frota recebe a versao que
-- sabe obedecer ao ajuste; so depois, com aparelho de verdade confirmando, o
-- numero sobe. Publicar o APK e mudar o ritmo no mesmo movimento seria trocar duas
-- coisas de uma vez e nao saber qual delas quebrou.

alter table public.tenants
  add column if not exists heartbeat_seconds integer not null default 60
    check (heartbeat_seconds between 30 and 900);

comment on column public.tenants.heartbeat_seconds is
  'De quantos em quantos segundos o aparelho diz "estou aqui". O que e urgente (comando, conteudo) vai por push e nao depende disto.';

-- QUANTO TEMPO SEM CONTATO = FORA DO AR.
--
-- Coluna calculada, e nao regra repetida. Antes esta conta existia em TRES lugares
-- com DOIS valores diferentes: 3 minutos na lista de aparelhos, 3 minutos de novo
-- (escritos na mao) na tela da loja, e 5 minutos na lista de pendencias. Espacar a
-- batida com isso espalhado pintaria a frota inteira de vermelho — e so em dois
-- dos tres lugares, o que e pior do que quebrar nos tres.
--
-- Tres batidas perdidas: uma queda de rede sozinha nao acusa aparelho morto, e o
-- valor de hoje (60 x 3 = 180s) e exatamente o que a lista de aparelhos ja usava.
alter table public.tenants
  add column if not exists tolerancia_sem_contato_segundos integer
    generated always as (heartbeat_seconds * 3) stored;

comment on column public.tenants.tolerancia_sem_contato_segundos is
  'Sem contato por mais que isto = fora do ar. Calculado, para painel e alertas nunca discordarem. Ver migration 20260731090000.';

-- Mudar o ritmo avisa a frota na hora, pelo mesmo caminho do conteudo — o valor
-- viaja na resposta de conteudo, entao ele entra na impressao digital sozinho.
--
-- ATENCAO ao ensinar o gatilho a reconhecer esta tabela: sao DUAS coisas, e
-- esquecer qualquer uma delas quebra em silencio.
--   1. entrar na lista `chaves`, senao a funcao devolve nulo e nunca avisa;
--   2. o alvo sai de `id`, e nao de `tenant_id` — a tabela de clientes E o
--      cliente. Sem isso o aviso sairia com alvo nulo e a funcao o recusaria.
-- Ver a migration 20260731100000, que e onde as duas moram.
drop trigger if exists tenants_acordar_por_conteudo on public.tenants;
create trigger tenants_acordar_por_conteudo
  after update of heartbeat_seconds on public.tenants
  for each row execute function private.acordar_por_conteudo();

-- ---------------------------------------------------------------------------
-- As pendencias passam a respeitar o ritmo configurado.
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
    d.temperature_c,
    -- Vem do cliente, e nao de um numero escrito aqui: se o ritmo da batida muda,
    -- a tolerancia muda junto e ninguem precisa lembrar de vir mexer nesta view.
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
  (not comh.is_device_owner or not comh.kiosk_locked,
   'sem_travas', 'atencao', 'da para desligar o Wi-Fi ou ligar o modo aviao'),
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

-- `create or replace view` NAO preserva security_invoker: sem esta linha a view
-- volta a rodar com os poderes de quem a criou e passa por cima do RLS,
-- entregando aparelho de um cliente para outro. Ja aconteceu aqui uma vez
-- (migration 20260730040000) — por isso vem logo abaixo do replace, sempre.
alter view public.v_device_issues set (security_invoker = on);
