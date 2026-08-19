-- Rede com o mesmo nome do local nao vira "X - X".
--
-- Apareceu no cliente de teste: a rede e a loja se chamam "Aparelhos de teste",
-- e o rotulo saiu "Aparelhos de teste - Aparelhos de teste". Nao quebra nada,
-- mas e o painel parecendo desatento — e e a mesma tela que precisa passar
-- confianca sobre numeros.
--
-- A mesma regra vale no painel (lib/datas.ts), de proposito: o texto daqui e o
-- texto de la, porque um e usado para FILTRAR o outro.
--
-- O replace bate no texto NORMALIZADO pelo Postgres (com os parenteses que ele
-- mesmo poe ao guardar a view), e nao no que foi escrito na migration anterior.
create or replace function public.nome_completo_da_loja(p_store_id uuid)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
           when c.name is null or btrim(c.name) = '' then s.name
           when btrim(c.name) = btrim(s.name)        then s.name
           else c.name || ' - ' || s.name
         end
  from public.stores s
  left join public.retail_chains c on c.id = s.chain_id
  where s.id = p_store_id;
$$;

do $$
declare
  v record;
  def text;
begin
  for v in
    select viewname, definition from pg_views
    where schemaname='public' and viewname like 'v_bi_%'
      and definition like '%loja_completa%'
  loop
    def := replace(
      v.definition,
      'WHEN ((ch.name IS NULL) OR (ch.name = ''''::text)) THEN s.name',
      'WHEN ((ch.name IS NULL) OR (ch.name = ''''::text) OR (btrim(ch.name) = btrim(s.name))) THEN s.name');

    if def = v.definition then
      raise exception 'view %: expressao esperada nao encontrada; revisar', v.viewname;
    end if;

    execute 'create or replace view public.' || quote_ident(v.viewname) || ' as ' || def;
    execute 'alter view public.' || quote_ident(v.viewname) || ' set (security_invoker = on)';
  end loop;
end $$;
