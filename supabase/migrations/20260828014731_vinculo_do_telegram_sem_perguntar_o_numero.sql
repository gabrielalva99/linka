-- O bot deixa de perguntar o numero.
--
-- ── O QUE MUDA ──────────────────────────────────────────────────────────────
-- Hoje sao dois passos que a pessoa precisa ligar sozinha: ela se cadastra numa
-- pagina, depois abre o bot, e o bot pergunta o celular para casar os dois. Cada
-- pergunta a mais e uma chance de digitar diferente do que cadastrou, e aí o
-- vinculo nao acontece e ninguem percebe.
--
-- Com o Telegram da para carregar um codigo no proprio link: `t.me/bot?start=X`
-- entrega X ao bot no primeiro contato. O bot manda X para nos e o vinculo sai
-- sem pergunta nenhuma.
--
-- ── POR QUE NAO O TOKEN DO CONVITE ─────────────────────────────────────────
-- O convite e da LOJA e pode ser usado por vinte pessoas. Se ele viajasse no
-- ?start, o bot saberia as lojas e nao saberia QUEM esta falando. Entao o codigo
-- e gerado por pessoa, no fim do cadastro, e vale uma vez so.
alter table public.contatos_de_loja
  add column if not exists vinculo_token text unique,
  add column if not exists vinculo_expira_em timestamptz;

comment on column public.contatos_de_loja.vinculo_token is
  'Codigo de uso unico que viaja no link do Telegram (?start=) para o bot saber quem esta falando sem perguntar o celular. Some assim que e usado.';

-- NOTA: a versao final de cadastrar_contato esta na migration seguinte
-- (20260828014911), que troca gen_random_bytes por gen_random_uuid. Ver la o
-- motivo. Mantida aqui a assinatura do dia para o historico bater.

-- ────────────────────────────────────────────────────────────────────────────
-- O BOT VINCULA PELO CODIGO, SEM PERGUNTAR NADA
create or replace function public.vincular_por_codigo(
  p_vinculo text, p_canal text, p_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_nome text;
begin
  update public.contatos_de_loja
     set id_no_canal = p_id,
         canal = coalesce(nullif(btrim(p_canal), ''), canal),
         -- QUEIMA O CODIGO. Ele dispensa confirmacao, entao valer duas vezes
         -- seria deixar quem visse o link assumir o lugar da pessoa.
         vinculo_token = null,
         vinculo_expira_em = null
   where vinculo_token = p_vinculo
     and vinculo_expira_em > now()
     and ativo
  returning nome into v_nome;

  if v_nome is null then
    return jsonb_build_object('ok', false, 'erro', 'vinculo_invalido');
  end if;
  return jsonb_build_object('ok', true, 'nome', v_nome);
end;
$$;

revoke all on function public.vincular_por_codigo(text, text, text) from public, anon, authenticated;
