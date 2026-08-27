-- API para o bot que fala com a loja.
--
-- O buraco que ela fecha apareceu em 25/08: o aviso por e-mail saiu as 13h41 e o
-- aparelho ficou quase seis horas apagado, porque quem podia plugar o cabo nao
-- recebe e-mail. Avisar nao e o suficiente; precisa chegar em quem age, e voltar
-- dizendo o que aconteceu.
--
-- ── O QUE ESTA API NAO FAZ ─────────────────────────────────────────────────
-- Nao manda mensagem, nao guarda telefone e nao conhece WhatsApp. Isso e do bot.
-- Aqui mora o que o LINKA sabe: quais aparelhos precisam de gente, como cada um
-- esta AGORA, e o registro do que a loja respondeu.
--
-- A separacao e de proposito: canal de mensagem muda (WhatsApp hoje, outra coisa
-- amanha) e nao pode arrastar o modelo de dados junto.

-- Senha de guarda propria. Terceira do projeto, mesmo desenho das outras duas.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'bot_guarda') then
    perform public.guardar_segredo('bot_guarda', encode(gen_random_bytes(32), 'hex'));
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- O QUE A LOJA RESPONDEU
--
-- Uma linha por resposta, nunca sobrescrita. "Fui la e nao voltou" as 14h e
-- "agora voltou" as 15h sao dois fatos, e a sequencia deles e o que mostra
-- quanto tempo a loja levou e quantas idas foram precisas.
create table if not exists public.alerta_triagem (
  id           bigserial primary key,
  alert_id     uuid not null references public.device_alerts(id) on delete cascade,
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  -- voltou: a loja diz que resolveu. nao_voltou: foi olhar e continua parado.
  -- erro: tem mensagem na tela. sem_resposta: o bot desistiu de esperar.
  resposta     text not null check (resposta in ('voltou','nao_voltou','erro','sem_resposta')),
  -- O que a pessoa escreveu, quando escreveu. Usado no caso "erro".
  texto        text,
  -- Quem respondeu, como a loja se identificou. OPCIONAL de proposito: o bot
  -- funciona sem, e sem ele nao ha dado pessoal nenhum nesta tabela.
  quem         text,
  canal        text,
  -- O que a telemetria dizia no instante da resposta. E o que permite comparar
  -- depois "a loja disse que voltou" com "o aparelho estava reportando".
  conferido_no_ar boolean,
  criado_em    timestamptz not null default now()
);

create index if not exists alerta_triagem_por_alerta
  on public.alerta_triagem (alert_id, criado_em desc);

alter table public.alerta_triagem enable row level security;

drop policy if exists alerta_triagem_le on public.alerta_triagem;
create policy alerta_triagem_le on public.alerta_triagem
  for select using (private.has_tenant_access(tenant_id));

comment on table public.alerta_triagem is
  'Respostas da loja sobre um alerta, uma linha por resposta. Preenchida pela funcao bot-api; o painel apenas le.';

-- ────────────────────────────────────────────────────────────────────────────
-- O NOME DO PROBLEMA EM PORTUGUES
--
-- Vive aqui e nao no bot: o dia em que entrar um tipo novo de alerta, o bot nao
-- pode precisar de deploy para saber falar dele. Foi o que aconteceu com o
-- app_removido em 22/08, que exigiu mexer no painel.
create or replace function public.rotulo_do_alerta(p_kind text)
returns text
language sql
immutable
as $$
  select case p_kind
    when 'app_removido'         then 'o aplicativo foi removido do aparelho'
    when 'fora_do_ar'           then 'o aparelho parou de responder'
    when 'tela_vazia'           then 'esta ligado, mas sem video na tela'
    when 'menu_parado'          then 'parado no menu de testes, sem a campanha'
    when 'sem_travas'           then 'sem as protecoes'
    when 'senha_de_tela'        then 'tem senha na tela de bloqueio'
    when 'atualizacao_travada'  then 'a atualizacao nao esta passando'
    when 'bateria_baixa'        then 'bateria baixa'
    when 'fora_da_tomada'       then 'fora do carregador'
    when 'quente'               then 'aparelho quente'
    when 'sem_loja'             then 'sem loja definida'
    when 'sem_modelo'           then 'sem modelo cadastrado'
    when 'faxina_sem_permissao' then 'a limpeza diaria esta bloqueada'
    when 'versao_atrasada'      then 'versao antiga do aplicativo'
    when 'em_manutencao'        then 'aberto com o PIN de manutencao'
    else p_kind
  end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- O QUE PRECISA DE GENTE AGORA
--
-- So o que e critico NESTE momento, lido de v_device_issues e nao da gravidade
-- gravada na abertura. Mesmo motivo do aviso por e-mail: device_alerts congela a
-- gravidade na insercao, e aparelho que morre as 22h30 abre como "atencao" e
-- nunca viraria critico, mesmo apagado o dia inteiro seguinte.
--
-- NOTA (27/08): esta assinatura ganhou a coluna `avisar` na migration
-- 20260827222859. Mantida aqui como estava no dia para o historico bater.
create or replace function public.alertas_para_o_bot()
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
  aberto_desde   timestamptz,
  minutos_aberto integer,
  loja_aberta    boolean,
  ja_respondido  boolean
)
language sql
security definer
set search_path to 'public'
as $$
  select a.id, a.tenant_id, t.name,
         coalesce(s.name, 'sem loja'), s.code,
         d.code, d.name,
         a.kind, public.rotulo_do_alerta(a.kind), i.detalhe,
         a.opened_at,
         greatest(1, (extract(epoch from now() - a.opened_at) / 60)::integer),
         i.aberta,
         exists (select 1 from public.alerta_triagem g where g.alert_id = a.id)
  from public.device_alerts a
  join public.devices d  on d.id = a.device_id
  join public.tenants t  on t.id = a.tenant_id
  left join public.stores s on s.id = d.store_id
  join public.v_device_issues i
    on i.device_id = a.device_id and i.tipo = a.kind
  where a.closed_at is null
    and i.gravidade = 'critico'
  order by a.opened_at;
$$;

comment on function public.alertas_para_o_bot() is
  'Alertas criticos AGORA, com loja e rotulo em portugues, para o bot decidir a quem falar. Le a gravidade de v_device_issues, nunca a gravada na abertura.';

-- ────────────────────────────────────────────────────────────────────────────
-- COMO ESTE APARELHO ESTA NESTE INSTANTE
--
-- Existe para o bot NAO ACREDITAR na palavra sozinha. Quando a loja responde
-- "ja voltou", o bot compara com isto: se o aparelho nao esta reportando, ele
-- devolve "aqui ele ainda nao voltou". Sem essa conferencia, "ja voltou" vira
-- botao de tirar o alerta da frente.
create or replace function public.aparelho_para_o_bot(p_code text)
returns table(
  aparelho      text,
  nome          text,
  loja          text,
  no_ar         boolean,
  visto_em      timestamptz,
  minutos_sem_falar integer,
  exibindo      boolean,
  modo          text,
  bateria       integer,
  carregando    boolean,
  protegido     boolean,
  versao        text,
  pendencias    text[]
)
language sql
security definer
set search_path to 'public'
as $$
  select d.code, d.name, coalesce(s.name, 'sem loja'),
         d.last_seen_at >= now() - make_interval(secs => t.tolerancia_sem_contato_segundos::double precision),
         d.last_seen_at,
         case when d.last_seen_at is null then null
              else (extract(epoch from now() - d.last_seen_at) / 60)::integer end,
         d.playing_url is not null,
         d.mode::text,
         d.battery_level,
         d.battery_charging,
         coalesce(d.is_device_owner, false) and coalesce(d.kiosk_locked, false),
         d.agent_version,
         array(select public.rotulo_do_alerta(i.tipo)
               from public.v_device_issues i where i.device_id = d.id)
  from public.devices d
  join public.tenants t on t.id = d.tenant_id
  left join public.stores s on s.id = d.store_id
  where d.code = p_code and d.is_active
  limit 1;
$$;

comment on function public.aparelho_para_o_bot(text) is
  'Estado do aparelho agora, para o bot conferir a resposta da loja em vez de acreditar nela.';

revoke all on function public.alertas_para_o_bot()          from public, anon, authenticated;
revoke all on function public.aparelho_para_o_bot(text)     from public, anon, authenticated;
