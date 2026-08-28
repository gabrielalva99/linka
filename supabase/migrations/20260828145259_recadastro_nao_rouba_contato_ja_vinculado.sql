-- Recadastro nao rouba contato ja vinculado.
--
-- ── O ATAQUE, achado na varredura antes de por em uso ──────────────────────
-- O link de convite circula por WhatsApp e e encaminhavel. Com ele mais o
-- celular de um vendedor (que quem trabalha na loja sabe), um estranho podia:
--   1. recadastrar aquele numero pela pagina publica
--   2. receber um codigo de vinculo NOVO
--   3. abrir o bot com esse codigo e ligar o proprio Telegram no lugar
-- A partir dai ele recebia os alertas daquela loja, e o vendedor legitimo
-- parava de receber sem nada acusar, porque `id_no_canal` foi sobrescrito.
--
-- ── O CONSERTO ─────────────────────────────────────────────────────────────
-- Quem JA esta vinculado nao ganha codigo novo. O recadastro continua servindo
-- para o caso legitimo (a pessoa abre o link de outra loja e quer somar aquela
-- loja as dela), mas nao entrega mais a chave de assumir o lugar de ninguem.
--
-- Trocou de celular ou de conta no Telegram? Ai passa por quem opera: remove no
-- painel e convida de novo. Uma pessoa a mais no caminho e o preco de nao deixar
-- um link encaminhado virar tomada de conta.
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
  v_ja_vinculado boolean;
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

  -- Ja existe e ja conversou com o bot? Entao nao sai codigo.
  select (id_no_canal is not null) into v_ja_vinculado
    from public.contatos_de_loja
   where tenant_id = v_convite.tenant_id and celular = v_fone;
  v_ja_vinculado := coalesce(v_ja_vinculado, false);

  insert into public.contatos_de_loja
    (tenant_id, nome, celular, confirmado_em, vinculo_token, vinculo_expira_em)
  values
    (v_convite.tenant_id, v_nome, v_fone, now(),
     case when v_ja_vinculado then null else v_vinculo end,
     case when v_ja_vinculado then null else now() + interval '1 hour' end)
  on conflict (tenant_id, celular)
    do update set
      -- O NOME SO E ACEITO DE QUEM AINDA NAO ESTA VINCULADO. Deixar um estranho
      -- renomear a pessoa cadastrada seria pouco util para ele e confuso para
      -- quem opera, que veria o nome mudar sozinho no painel.
      nome = case when v_ja_vinculado then public.contatos_de_loja.nome
                  else excluded.nome end,
      ativo = true,
      confirmado_em = now(),
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
    'ja_vinculado', v_ja_vinculado,
    -- Sem codigo para quem ja esta ligado: a pagina mostra "voce ja esta
    -- conectado" em vez do botao do Telegram.
    'vinculo', case when v_ja_vinculado then null else v_vinculo end
  );
end;
$$;

grant execute on function public.cadastrar_contato(text, text, text) to anon, authenticated;
