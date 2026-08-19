-- Mesmo nome, uma linha so.
--
-- Trocar o nome tecnico pelo nome de verdade nao bastou: o relatorio continuava
-- mostrando "Camera" duas vezes, com 19 e com 6 aberturas. O agrupamento
-- incluia a CATEGORIA, e os pacotes tinham categorias diferentes.
--
-- ATENCAO A QUEM FOR REAPLICAR ESTA SEQUENCIA: este arquivo usa replace global
-- no corpo da funcao e ATINGE outros blocos que tem o mesmo texto. As duas
-- migrations seguintes existem para consertar isso. Estao aqui como historico
-- honesto, na ordem em que o banco registrou.
do $$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='preencher_rollup_dia';

  if position('c.category as categoria' in def) = 0
     or position('group by 1,2,3,4,5' in def) = 0 then
    raise exception 'preencher_rollup_dia mudou; revisar antes de trocar';
  end if;

  def := replace(def, 'c.category as categoria', 'max(c.category) as categoria');
  def := replace(def, 'group by 1,2,3,4,5', 'group by 1,2,3,4');
  execute def;
end $$;
