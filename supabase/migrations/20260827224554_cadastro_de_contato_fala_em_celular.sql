-- O parametro tambem deixa de presumir o canal.
--
-- A coluna virou `celular` na migration anterior, mas a funcao continuava
-- pedindo `p_whatsapp`. Nome de parametro mentindo sobre o que recebe e o tipo
-- de coisa que confunde quem le daqui a seis meses.
drop function if exists public.cadastrar_contato(text, text, text);

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
  -- Aceita o que a pessoa digitar e limpa aqui: exigir formato certo numa tela
  -- de celular, em loja, e o jeito mais rapido de ninguem se cadastrar.
  v_fone text := regexp_replace(coalesce(p_celular,''), '[^0-9]', '', 'g');
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
  -- Sem DDI o numero nao serve para casar com o que o canal entrega. 55 e o
  -- unico pais em operacao hoje; quando entrar outro, isto vira campo do cliente.
  if length(v_fone) in (10, 11) then v_fone := '55' || v_fone; end if;
  if v_fone !~ '^[0-9]{12,15}$' then
    return jsonb_build_object('ok', false, 'erro', 'telefone_invalido');
  end if;

  -- Mesmo numero se cadastrando de novo ATUALIZA e acrescenta lojas, em vez de
  -- criar pessoa repetida. Quem cuida de tres lojas costuma abrir tres links.
  --
  -- NAO mexe em id_no_canal: quem ja conversou com o bot continua alcancavel
  -- mesmo se abrir outro link depois.
  insert into public.contatos_de_loja (tenant_id, nome, celular, confirmado_em)
  values (v_convite.tenant_id, v_nome, v_fone, now())
  on conflict (tenant_id, celular)
    do update set nome = excluded.nome, ativo = true, confirmado_em = now()
  returning id into v_id;

  insert into public.contato_lojas (contato_id, store_id)
  select v_id, unnest(v_convite.lojas)
  on conflict do nothing;

  update public.convites_de_contato set usos = usos + 1 where id = v_convite.id;

  return jsonb_build_object('ok', true, 'lojas', array_length(v_convite.lojas, 1));
end;
$$;

grant execute on function public.cadastrar_contato(text, text, text) to anon, authenticated;
