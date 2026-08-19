-- A categoria passa a seguir o NOME, e nao o pacote.
--
-- Depois de unificar o nome, "Camera" ainda aparecia duas vezes: 19 e 6. O
-- rollup guarda uma linha por aparelho e hora, e a categoria vinha do pacote —
-- num aparelho o app de camera esta catalogado (categoria 'camera'), no outro e
-- um pacote diferente que ninguem catalogou (categoria nula).
--
-- Se dois pacotes se chamam "Camera" para o cliente, eles sao o mesmo recurso —
-- e recurso tem uma categoria so.
create or replace function public.categoria_do_app(p_package text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select c.category from public.app_catalog c
      where c.package = p_package and c.category is not null and c.category <> ''),
    (select c2.category from public.app_catalog c2
      where c2.label = public.nome_do_app(p_package)
        and c2.category is not null and c2.category <> ''
      order by c2.package
      limit 1)
  );
$$;

do $$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='preencher_rollup_dia';

  if position('max(c.category) as categoria' in def) = 0 then
    raise exception 'preencher_rollup_dia mudou; revisar antes de trocar';
  end if;

  def := replace(def, 'max(c.category) as categoria', 'public.categoria_do_app(e.package) as categoria');
  def := replace(def, 'group by 1,2,3,4', 'group by 1,2,3,4,5');
  execute def;
end $$;
