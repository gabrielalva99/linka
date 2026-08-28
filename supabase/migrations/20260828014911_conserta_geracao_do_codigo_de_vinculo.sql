-- Conserta a geracao do codigo de vinculo.
--
-- A funcao tem `set search_path to 'public'`, que e a trava certa contra
-- sequestro de esquema, mas `gen_random_bytes` mora em `extensions` (pgcrypto).
-- Resultado: toda tentativa de cadastro estourava com "function does not exist".
--
-- Pego no teste do fluxo, antes de qualquer pessoa real abrir o link.
--
-- Troca por `gen_random_uuid`, que e do proprio Postgres desde a 13 e nao
-- depende de extensao nenhuma. Da 32 caracteres hexadecimais, com folga dentro
-- do limite do `?start=` do Telegram e entropia de sobra.
create or replace function public.cadastrar_contato(
  p_token text, p_nome text, p_celular text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_convite public.convites_de_contato;
  v_nome text := btrim(p_nome);
  v_fone text := regexp_replace(coalesce(p_celular,''), '[^0-9]', '', 'g');
  v_id uuid;
  v_vinculo text := replace(gen_random_uuid()::text, '-', '');
begin
  select * into v_convite from public.convites_de_contato
   where token = p_token
     and (expira_em is null or expira_em > now())
     and usos < max_usos;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'convite_invalido');
  end if;
  if length(v_nome) < 3 then
    return jsonb_build_object('ok', false, 'erro', 'nome_curto');
  end if;
  if length(v_fone) in (10, 11) then v_fone := '55' || v_fone; end if;
  if v_fone !~ '^[0-9]{12,15}$' then
    return jsonb_build_object('ok', false, 'erro', 'telefone_invalido');
  end if;

  -- Uma hora de validade: o codigo existe para cobrir o caminho entre esta tela
  -- e o Telegram, que sao segundos. Prazo curto porque ele dispensa qualquer
  -- outra confirmacao, entao nao pode ficar vivo no historico do navegador.
  --
  -- NAO mexe em id_no_canal: quem ja conversou com o bot continua alcancavel.
  insert into public.contatos_de_loja
    (tenant_id, nome, celular, confirmado_em, vinculo_token, vinculo_expira_em)
  values
    (v_convite.tenant_id, v_nome, v_fone, now(), v_vinculo, now() + interval '1 hour')
  on conflict (tenant_id, celular)
    do update set nome = excluded.nome, ativo = true, confirmado_em = now(),
                  vinculo_token = excluded.vinculo_token,
                  vinculo_expira_em = excluded.vinculo_expira_em
  returning id into v_id;

  insert into public.contato_lojas (contato_id, store_id)
  select v_id, unnest(v_convite.lojas)
  on conflict do nothing;

  update public.convites_de_contato set usos = usos + 1 where id = v_convite.id;

  return jsonb_build_object(
    'ok', true,
    'lojas', array_length(v_convite.lojas, 1),
    'vinculo', v_vinculo
  );
end;
$$;

grant execute on function public.cadastrar_contato(text, text, text) to anon, authenticated;
