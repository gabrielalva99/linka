-- "Shopping Interlagos" nao e a loja: e o shopping onde a loja esta.
--
-- APONTADO PELO GABRIEL (19/08). O relatorio dizia "Loja: Shopping Interlagos".
-- So que esse e o LOCAL — a loja e a Casas Bahia que fica la dentro.
--
-- E NAO E SO IMPRECISAO DE TEXTO. Existem TRES lojas chamadas "Shopping
-- Interlagos" no cadastro: Casas Bahia (SPC7613), Ponto Frio (SPC7612) e Lojas
-- Americanas (SPC7614). O relatorio filtra por nome, entao escolher "Shopping
-- Interlagos" no filtro trazia as TRES somadas, como se fossem uma. Numero
-- errado apresentado como certo.
--
-- O modelo de dados ja estava certo: rede e local sao colunas separadas. Quem
-- estava errado era a apresentacao, que mostrava metade da identidade.
create or replace function public.nome_completo_da_loja(p_store_id uuid)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
           when c.name is null or c.name = '' then s.name
           else c.name || ' - ' || s.name
         end
  from public.stores s
  left join public.retail_chains c on c.id = s.chain_id
  where s.id = p_store_id;
$$;

do $$
declare
  def text;
  n_exib int;
  n_filtro int;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='fleet_report';

  select count(*) into n_exib from regexp_matches(def, 'coalesce\(s\.name,''sem loja''\)', 'g');
  select count(*) into n_filtro from regexp_matches(def, 's\.name = p_loja', 'g');

  if n_exib <> 2 or n_filtro <> 4 then
    raise exception 'fleet_report mudou (exibicoes=%, filtros=%); revisar antes de trocar', n_exib, n_filtro;
  end if;

  def := replace(def, 'coalesce(s.name,''sem loja'')',
                      'coalesce(public.nome_completo_da_loja(s.id),''sem loja'')');
  def := replace(def, 's.name = p_loja',
                      'public.nome_completo_da_loja(s.id) = p_loja');
  execute def;
end $$;
