-- As views de BI ganham `loja_completa`, sem perder `loja`.
--
-- Coluna NOVA e no FIM, aditiva de proposito: `rede` e `loja` continuam
-- exatamente como estao, porque o BI da marca ja consome as duas separadas e
-- mexer no que ele le e quebrar o cliente numero um dos dados. (Entra no fim
-- porque `create or replace view` so aceita coluna nova no fim.)
--
-- A expressao usa `ch.name` e `s.name`, que ja estao no GROUP BY. Chamar
-- nome_completo_da_loja(s.id) exigiria mexer no GROUP BY de view de BI, que e
-- trocar risco por conveniencia.
do $$
declare
  v record;
  def text;
  pos int;
  rotulo constant text :=
    ',
    CASE
        WHEN ch.name IS NULL OR ch.name = ''''::text THEN s.name
        ELSE ((ch.name || '' - ''::text) || s.name)
    END AS loja_completa';
begin
  for v in
    select viewname, definition
    from pg_views where schemaname='public' and viewname like 'v_bi_%'
  loop
    if position('loja_completa' in v.definition) > 0 then
      continue;
    end if;

    pos := position('
   FROM ' in v.definition);
    if pos = 0 then
      raise exception 'view %: nao achei o FROM principal; revisar', v.viewname;
    end if;

    def := substring(v.definition from 1 for pos - 1)
        || rotulo
        || substring(v.definition from pos);

    execute 'create or replace view public.' || quote_ident(v.viewname) || ' as ' || def;
    execute 'alter view public.' || quote_ident(v.viewname) || ' set (security_invoker = on)';
  end loop;
end $$;
