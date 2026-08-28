-- Contato de loja nao atravessa cliente.
--
-- ── OS DOIS FUROS, ACHADOS EM VARREDURA ANTES DE POR EM USO ────────────────
--
-- 1) O convite guarda `lojas uuid[]` e um `tenant_id`, e NADA garantia que as
--    lojas fossem daquele cliente. Um convite do cliente A podia listar loja do
--    cliente B, e quem se cadastrasse por ele passaria a receber alerta da loja
--    de outra marca.
--
-- 2) A politica de `contato_lojas` conferia o cliente do CONTATO e nao o da
--    LOJA. Entao dava para ligar contato de A a loja de B, e `quem_avisar` da
--    loja de B devolveria o telefone da pessoa de A.
--
-- Nenhum dos dois era alcancavel pela tela: o painel le a loja sob RLS antes de
-- criar o convite. Mas defesa que so existe na tela nao e defesa, e este projeto
-- ja consertou isso em auditoria (30/07) e em conteudo (30/07) pelo mesmo motivo.
-- O banco tem que recusar sozinho.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. O CONVITE SO ACEITA LOJA DO PROPRIO CLIENTE
--
-- Gatilho e nao CHECK: a validacao consulta outra tabela, e CHECK nao pode.
create or replace function private.convite_so_com_lojas_do_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_fora integer;
begin
  if new.lojas is null or array_length(new.lojas, 1) is null then
    raise exception 'convite sem loja';
  end if;
  select count(*) into v_fora
    from unnest(new.lojas) as l(id)
    left join public.stores s on s.id = l.id
   where s.id is null or s.tenant_id <> new.tenant_id;
  if v_fora > 0 then
    raise exception 'convite com loja de outro cliente ou inexistente';
  end if;
  return new;
end;
$$;

drop trigger if exists convite_valida_lojas on public.convites_de_contato;
create trigger convite_valida_lojas
  before insert or update of lojas, tenant_id on public.convites_de_contato
  for each row execute function private.convite_so_com_lojas_do_cliente();

-- ────────────────────────────────────────────────────────────────────────────
-- 2. O VINCULO CONTATO-LOJA EXIGE O MESMO CLIENTE DOS DOIS LADOS
drop policy if exists contato_lojas_por_cliente on public.contato_lojas;
create policy contato_lojas_por_cliente on public.contato_lojas
  for all
  using (exists (
    select 1
      from public.contatos_de_loja c
      join public.stores s on s.id = contato_lojas.store_id
     where c.id = contato_lojas.contato_id
       and s.tenant_id = c.tenant_id
       and private.has_tenant_access(c.tenant_id)))
  with check (exists (
    select 1
      from public.contatos_de_loja c
      join public.stores s on s.id = contato_lojas.store_id
     where c.id = contato_lojas.contato_id
       and s.tenant_id = c.tenant_id
       and private.has_tenant_access(c.tenant_id)));

-- E o mesmo em nivel de dado, para valer tambem contra service_role, que ignora
-- RLS. As funcoes do bot rodam com ela.
create or replace function private.contato_e_loja_do_mesmo_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from public.contatos_de_loja c
      join public.stores s on s.id = new.store_id
     where c.id = new.contato_id and s.tenant_id = c.tenant_id
  ) then
    raise exception 'contato e loja sao de clientes diferentes';
  end if;
  return new;
end;
$$;

drop trigger if exists contato_lojas_mesmo_cliente on public.contato_lojas;
create trigger contato_lojas_mesmo_cliente
  before insert or update on public.contato_lojas
  for each row execute function private.contato_e_loja_do_mesmo_cliente();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. O CAMINHO DE TRAS DO VINCULO PARA DE ACERTAR VARIAS PESSOAS
--
-- `registrar_id_no_canal` casava pelo celular SEM olhar cliente. Numero digitado
-- errado que por acaso batesse com o de outra pessoa, em outro cliente, ligaria
-- as duas ao mesmo Telegram, e uma delas passaria a receber alerta de uma marca
-- com que nao tem nada a ver.
--
-- Agora: se o numero apontar para mais de uma pessoa, recusa e manda usar o
-- codigo do link, que aponta para uma so.
create or replace function public.registrar_id_no_canal(
  p_celular text, p_canal text, p_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fone text := regexp_replace(coalesce(p_celular,''), '[^0-9]', '', 'g');
  v_quantos integer;
  v_n integer;
begin
  if length(v_fone) in (10, 11) then v_fone := '55' || v_fone; end if;

  select count(*) into v_quantos
    from public.contatos_de_loja where celular = v_fone and ativo;

  if v_quantos = 0 then
    return jsonb_build_object('ok', false, 'contatos', 0, 'erro', 'nao_encontrado');
  end if;
  if v_quantos > 1 then
    return jsonb_build_object('ok', false, 'contatos', v_quantos, 'erro', 'numero_ambiguo');
  end if;

  update public.contatos_de_loja
     set id_no_canal = p_id, canal = coalesce(nullif(btrim(p_canal), ''), canal)
   where celular = v_fone and ativo;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n = 1, 'contatos', v_n);
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Caminho travado na funcao de rotulo, apontado pelo verificador.
--
-- Ela e SECURITY INVOKER, entao o risco e menor, mas roda DENTRO de funcoes
-- SECURITY DEFINER. Sem search_path fixo, quem controlasse o caminho de busca
-- poderia trocar o que ela chama.
create or replace function public.rotulo_do_alerta(p_kind text)
returns text
language sql
immutable
set search_path to 'public'
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

revoke all on function public.registrar_id_no_canal(text, text, text) from public, anon, authenticated;
