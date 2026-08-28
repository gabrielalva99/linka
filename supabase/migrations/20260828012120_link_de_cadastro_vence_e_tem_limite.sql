-- O link de cadastro passa a vencer e a ter limite.
--
-- ── O FURO ──────────────────────────────────────────────────────────────────
-- O convite nasceu sem prazo e sem teto. Ele vai pelo WhatsApp de um vendedor,
-- fica no historico do celular dele para sempre, e pode ser encaminhado. Quem
-- recebesse daqui a um ano ainda conseguiria entrar e passar a receber aviso de
-- aparelho, com codigo, loja e problema.
--
-- Nao e catastrofe: quem entra so RECEBE informacao de uma loja, nao enxerga a
-- frota, nao manda comando e nao alcanca outro cliente. Mas e vazamento de dado
-- operacional de cliente, e era evitavel com tres campos.
alter table public.convites_de_contato
  -- 30 dias cobre com folga o tempo entre mandar o link e a pessoa abrir, e
  -- fecha a janela do link esquecido no historico. Renovar e um clique.
  alter column expira_em set default now() + interval '30 days',
  -- Um convite de loja e para uma equipe pequena. Teto alto o bastante para
  -- nao atrapalhar e baixo o bastante para denunciar uso indevido.
  add column if not exists max_usos integer not null default 20;

-- Convites que ja existem tambem passam a vencer, contados de agora.
update public.convites_de_contato
   set expira_em = now() + interval '30 days'
 where expira_em is null;

-- ────────────────────────────────────────────────────────────────────────────
-- As duas funcoes publicas passam a respeitar o teto.
--
-- Mesmo tratamento para vencido, esgotado e inexistente: some sem dizer qual
-- dos tres. Diferenciar contaria a quem tem o link que ele um dia funcionou.
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
    and c.usos < c.max_usos
  limit 1;
$$;

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

grant execute on function public.convite_de_contato(text) to anon, authenticated;
grant execute on function public.cadastrar_contato(text, text, text) to anon, authenticated;
