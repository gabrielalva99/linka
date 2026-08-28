-- A pessoa pode sair pelo proprio bot.
--
-- A politica de privacidade publicada em 27/08 promete, com todas as letras:
-- "basta responder SAIR em qualquer mensagem (...) a remocao e imediata". Sem
-- isto a promessa seria falsa, e promessa de privacidade que nao se cumpre e
-- pior do que nao ter feito.
--
-- ── DESLIGA PELO CANAL, NAO PELO TELEFONE ──────────────────────────────────
-- Quem escreve SAIR esta falando com o bot, entao o bot ja sabe o chat_id. Pedir
-- o telefone de novo nesse momento seria pedir esforco justamente a quem esta
-- tentando ir embora, e cada passo a mais e uma chance de a saida nao acontecer.
create or replace function public.desligar_contato(p_canal text, p_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n integer;
begin
  -- Desativa, nao apaga. A triagem ja registrada aponta para esta pessoa, e
  -- apagar a linha levaria junto o historico de quem respondeu o que na loja.
  -- O que some e o alcance: sem id_no_canal e sem ativo, ela sai do `avisar` e
  -- nenhuma mensagem nova sai.
  update public.contatos_de_loja
     set ativo = false, id_no_canal = null
   where canal = p_canal and id_no_canal = p_id and ativo;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0, 'contatos', v_n);
end;
$$;

comment on function public.desligar_contato(text, text) is
  'Tira a pessoa dos avisos quando ela responde SAIR ao bot. Desativa e some do alcance; nao apaga, porque a triagem ja gravada aponta para ela.';

revoke all on function public.desligar_contato(text, text) from public, anon, authenticated;
