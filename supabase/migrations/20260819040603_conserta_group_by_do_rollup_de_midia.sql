-- Conserto de um estrago meu, duas migrations atras.
--
-- Troquei 'group by 1,2,3,4' por 'group by 1,2,3,4,5' com replace global, e a
-- funcao tem OUTROS blocos com o mesmo texto: os do rollup de midia (no_ar e
-- paradas). Os dois passaram a agrupar por coluna agregada e a funcao inteira
-- parou de rodar — ou seja, todos os relatorios do dia.
--
-- Aqui cada troca leva a linha anterior junto, que e o que torna o alvo unico.
-- Replace global em corpo de funcao e o mesmo erro de sed sem ancora: funciona
-- ate o dia em que o texto aparece duas vezes.
do $$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='preencher_rollup_dia';

  def := replace(
    def,
    'and f.hora_local >= v_dia::timestamp and f.hora_local < (v_dia + 1)::timestamp
    group by 1,2,3,4,5',
    'and f.hora_local >= v_dia::timestamp and f.hora_local < (v_dia + 1)::timestamp
    group by 1,2,3,4');

  def := replace(
    def,
    'where v.hora_local >= v_dia::timestamp and v.hora_local < (v_dia + 1)::timestamp
    group by 1,2,3,4,5',
    'where v.hora_local >= v_dia::timestamp and v.hora_local < (v_dia + 1)::timestamp
    group by 1,2,3,4');

  execute def;
end $$;
