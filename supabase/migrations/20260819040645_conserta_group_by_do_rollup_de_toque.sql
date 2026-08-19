-- Terceiro bloco atingido pelo mesmo replace global: o rollup de toque.
--
-- Ele tambem tinha 'group by 1,2,3,4' e virou 1,2,3,4,5 — so que a quinta
-- coluna dele e count(*), um agregado. Consertando pelo unico jeito seguro:
-- corta a definicao no marcador do bloco (o filtro 'feature_tap', que so existe
-- ali) e aplica a troca apenas dali para a frente.
do $$
declare
  def text;
  pos int;
  p1  text;
  p2  text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='preencher_rollup_dia';

  pos := position('feature_tap' in def);
  if pos = 0 then
    raise exception 'bloco de toque nao encontrado; revisar antes de mexer';
  end if;

  p1 := substring(def from 1 for pos);
  p2 := substring(def from pos + 1);
  p2 := replace(p2, 'group by 1,2,3,4,5', 'group by 1,2,3,4');

  execute p1 || p2;
end $$;
