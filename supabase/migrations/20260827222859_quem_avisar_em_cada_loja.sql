-- Quem avisar em cada loja.
--
-- O buraco: em 25/08 o aviso critico saiu as 13h41 e o aparelho ficou seis horas
-- apagado, porque quem podia plugar o cabo nao recebe e-mail. E em 26/08 os doze
-- aparelhos da loja foram desprovisionados em dez minutos sem ninguem por perto
-- para perguntar o que estava acontecendo.
--
-- ── POR QUE ISTO VIVE AQUI E NAO NO BOT ────────────────────────────────────
-- A primeira ideia foi deixar contato numa tabela do bot. Cai por dois motivos:
-- auto-cadastro precisa de tela, e "uma pessoa que cuida de varias lojas" e
-- estrutura de dado, nao configuracao. O master do shopping e o vendedor de uma
-- loja so sao o MESMO desenho: pessoa ligada a um conjunto de lojas, um com
-- quinze e outro com uma.
--
-- ── DADO PESSOAL, DE OLHOS ABERTOS ─────────────────────────────────────────
-- Isto guarda nome e telefone de gente. Em 24/08 tiramos dado pessoal do
-- aplicativo Android de proposito, e isto NAO desfaz aquilo: o app continua sem
-- coletar nada, e a declaracao da Play segue valendo. O que muda e a politica de
-- privacidade do painel, que passa a precisar cobrir contato de loja.

create table if not exists public.contatos_de_loja (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  nome        text not null,
  -- So digitos, com DDI. Guardar formatado ("(11) 9 8888-7777") faz o mesmo
  -- numero virar duas pessoas na hora de comparar.
  whatsapp    text not null check (whatsapp ~ '^[0-9]{10,15}$'),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  -- Quando a propria pessoa se cadastrou pelo link, em vez de alguem digitar
  -- por ela. Numero que a pessoa confirmou vale mais que numero anotado.
  confirmado_em timestamptz,
  unique (tenant_id, whatsapp)
);

create table if not exists public.contato_lojas (
  contato_id uuid not null references public.contatos_de_loja(id) on delete cascade,
  store_id   uuid not null references public.stores(id) on delete cascade,
  primary key (contato_id, store_id)
);

-- CONVITE: um link, uma ou muitas lojas.
--
-- O mesmo mecanismo atende o vendedor de uma loja e o master do shopping. Quem
-- cria escolhe as lojas; a pessoa abre o link e se cadastra em todas de uma vez.
create table if not exists public.convites_de_contato (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  token      text not null unique,
  -- Aparece para a pessoa: "Vendedores do Shopping Interlagos".
  rotulo     text not null,
  lojas      uuid[] not null,
  expira_em  timestamptz,
  usos       integer not null default 0,
  criado_em  timestamptz not null default now()
);

alter table public.contatos_de_loja    enable row level security;
alter table public.contato_lojas       enable row level security;
alter table public.convites_de_contato enable row level security;

drop policy if exists contatos_por_cliente on public.contatos_de_loja;
create policy contatos_por_cliente on public.contatos_de_loja
  for all using (private.has_tenant_access(tenant_id))
  with check (private.has_tenant_access(tenant_id));

drop policy if exists contato_lojas_por_cliente on public.contato_lojas;
create policy contato_lojas_por_cliente on public.contato_lojas
  for all using (exists (
    select 1 from public.contatos_de_loja c
    where c.id = contato_id and private.has_tenant_access(c.tenant_id)))
  with check (exists (
    select 1 from public.contatos_de_loja c
    where c.id = contato_id and private.has_tenant_access(c.tenant_id)));

drop policy if exists convites_por_cliente on public.convites_de_contato;
create policy convites_por_cliente on public.convites_de_contato
  for all using (private.has_tenant_access(tenant_id))
  with check (private.has_tenant_access(tenant_id));

-- ────────────────────────────────────────────────────────────────────────────
-- A PAGINA DE AUTO-CADASTRO
--
-- Chamadas por quem NAO esta logado: a pessoa da loja abre um link e se
-- cadastra. Por isso SECURITY DEFINER com validacao do token dentro, e nunca
-- acesso direto a tabela.
create or replace function public.convite_de_contato(p_token text)
returns table(rotulo text, cliente text, lojas text[])
language sql
security definer
set search_path to 'public'
as $$
  select c.rotulo, t.name,
         array(select s.name from public.stores s where s.id = any(c.lojas) order by s.name)
  from public.convites_de_contato c
  join public.tenants t on t.id = c.tenant_id
  where c.token = p_token
    and (c.expira_em is null or c.expira_em > now())
  limit 1;
$$;

create or replace function public.cadastrar_contato(
  p_token text, p_nome text, p_whatsapp text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_convite public.convites_de_contato;
  v_nome text := btrim(p_nome);
  -- Aceita o que a pessoa digitar e limpa aqui: exigir formato certo numa tela
  -- de celular, em loja, e o jeito mais rapido de ninguem se cadastrar.
  v_fone text := regexp_replace(coalesce(p_whatsapp,''), '[^0-9]', '', 'g');
  v_id uuid;
begin
  select * into v_convite from public.convites_de_contato
   where token = p_token and (expira_em is null or expira_em > now());
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'convite_invalido');
  end if;
  if length(v_nome) < 3 then
    return jsonb_build_object('ok', false, 'erro', 'nome_curto');
  end if;
  -- Sem DDI o numero nao serve para mandar mensagem. 55 e o unico pais em
  -- operacao hoje; quando entrar outro, isto vira campo do cliente.
  if length(v_fone) in (10, 11) then v_fone := '55' || v_fone; end if;
  if v_fone !~ '^[0-9]{12,15}$' then
    return jsonb_build_object('ok', false, 'erro', 'telefone_invalido');
  end if;

  -- Mesmo numero se cadastrando de novo ATUALIZA e acrescenta lojas, em vez de
  -- criar pessoa repetida. Quem cuida de tres lojas costuma abrir tres links.
  insert into public.contatos_de_loja (tenant_id, nome, whatsapp, confirmado_em)
  values (v_convite.tenant_id, v_nome, v_fone, now())
  on conflict (tenant_id, whatsapp)
    do update set nome = excluded.nome, ativo = true, confirmado_em = now()
  returning id into v_id;

  insert into public.contato_lojas (contato_id, store_id)
  select v_id, unnest(v_convite.lojas)
  on conflict do nothing;

  update public.convites_de_contato set usos = usos + 1 where id = v_convite.id;

  return jsonb_build_object('ok', true, 'lojas', array_length(v_convite.lojas, 1));
end;
$$;

grant execute on function public.convite_de_contato(text) to anon, authenticated;
grant execute on function public.cadastrar_contato(text, text, text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- QUEM AVISAR SOBRE ESTE ALERTA
--
-- Devolvido junto do alerta para o bot nao precisar mapear nada. Ele so manda.
create or replace function public.quem_avisar(p_store uuid)
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object('nome', c.nome, 'whatsapp', c.whatsapp)), '[]'::jsonb)
  from public.contatos_de_loja c
  join public.contato_lojas cl on cl.contato_id = c.id
  where cl.store_id = p_store and c.ativo;
$$;

-- A lista de alertas do bot passa a dizer a quem falar.
-- DROP antes do CREATE: acrescentar coluna a um RETURNS TABLE muda o tipo de
-- retorno, e o Postgres recusa o CREATE OR REPLACE nesse caso.
drop function if exists public.alertas_para_o_bot();
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
    and i.gravidade = 'critico'
  order by a.opened_at;
$$;

revoke all on function public.quem_avisar(uuid) from public, anon, authenticated;
revoke all on function public.alertas_para_o_bot() from public, anon, authenticated;
