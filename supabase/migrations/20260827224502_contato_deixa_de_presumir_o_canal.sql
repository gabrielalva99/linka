-- O contato deixa de presumir o canal.
--
-- Nasceu ontem com a coluna chamada `whatsapp`, e hoje o bot vai comecar pelo
-- Telegram. Nome de coluna que presume o canal envelhece em um dia, e o proximo
-- que ler vai achar que existe WhatsApp onde nao existe.
--
-- ── O FURO MAIOR, QUE O NOME ESCONDIA ──────────────────────────────────────
-- No Telegram o bot NAO endereca mensagem por telefone: ele fala com um chat_id,
-- que so existe depois que a pessoa inicia a conversa. O numero serve para gente
-- saber quem e a pessoa; nao serve para entregar a mensagem.
--
-- Por isso agora sao duas coisas separadas:
--   celular      -> como um humano identifica a pessoa. Sempre util.
--   id_no_canal  -> como o bot entrega a mensagem. Preenchido pelo proprio bot,
--                   no primeiro contato, e diferente em cada canal.
alter table public.contatos_de_loja
  rename column whatsapp to celular;

alter table public.contatos_de_loja
  add column if not exists canal text not null default 'telegram',
  -- Nulo ate a pessoa falar com o bot pela primeira vez. Enquanto for nulo, o
  -- contato existe no cadastro mas ainda nao e alcancavel, e o bot precisa
  -- saber a diferenca.
  add column if not exists id_no_canal text;

comment on column public.contatos_de_loja.celular is
  'So digitos, com DDI. Identifica a pessoa para quem opera; nao e endereco de entrega.';
comment on column public.contatos_de_loja.id_no_canal is
  'Como o bot alcanca esta pessoa no canal dela (chat_id no Telegram). Nulo enquanto ela nao iniciar a conversa.';

-- ────────────────────────────────────────────────────────────────────────────
-- QUEM AVISAR, agora dizendo tambem POR ONDE e se ja da para alcancar.
create or replace function public.quem_avisar(p_store uuid)
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'contato_id',  c.id,
           'nome',        c.nome,
           'celular',     c.celular,
           'canal',       c.canal,
           'id_no_canal', c.id_no_canal,
           -- O bot decide entre "mandar mensagem" e "pedir para a pessoa iniciar
           -- a conversa" sem precisar interpretar nulo.
           'alcancavel',  c.id_no_canal is not null
         )), '[]'::jsonb)
  from public.contatos_de_loja c
  join public.contato_lojas cl on cl.contato_id = c.id
  where cl.store_id = p_store and c.ativo;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- O BOT GRAVA O IDENTIFICADOR QUANDO A PESSOA APARECE
--
-- Casa pelo celular, que e o que a pessoa informou no cadastro e o que o
-- Telegram entrega quando ela compartilha o contato.
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
  v_n integer;
begin
  if length(v_fone) in (10, 11) then v_fone := '55' || v_fone; end if;
  update public.contatos_de_loja
     set id_no_canal = p_id, canal = coalesce(nullif(btrim(p_canal), ''), canal)
   where celular = v_fone and ativo;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0, 'contatos', v_n);
end;
$$;

revoke all on function public.quem_avisar(uuid) from public, anon, authenticated;
revoke all on function public.registrar_id_no_canal(text, text, text) from public, anon, authenticated;
