-- Aparelho retirado para venda sai da lista de problemas.
--
-- Sem isto, todo aparelho vendido viraria "fora do ar" para sempre: o alerta
-- abriria no dia da venda e nunca mais fecharia, porque o aparelho nunca mais
-- vai reportar. Com 250 na rua e uma loja que vende exposicao com frequencia, e
-- a receita para a lista de pendencias virar ruido que ninguem le.
do $$
declare def text;
begin
  select pg_get_viewdef('public.v_device_issues'::regclass, true) into def;
  if position('WHERE d.is_active' in def) = 0 then
    raise exception 'a clausula esperada nao existe mais; revisar antes de recriar a view';
  end if;
  def := replace(def, 'WHERE d.is_active', 'WHERE d.is_active AND d.retirado_em IS NULL');
  execute 'create or replace view public.v_device_issues as ' || def;
end $$;

-- Reafirma o security_invoker: recriar view ja apagou esta opcao neste projeto
-- uma vez (ver migration views_de_bi_perderam_o_rls), e sem ela a view passa a
-- ler com os poderes de quem a criou — ou seja, atravessa cliente.
alter view public.v_device_issues set (security_invoker = on);
