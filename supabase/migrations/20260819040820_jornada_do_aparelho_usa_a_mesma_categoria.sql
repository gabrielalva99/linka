-- A jornada do aparelho passa a resolver a categoria do mesmo jeito que o
-- relatorio da rede: pelo nome, nao pelo pacote.
--
-- Sem isto as duas telas discordariam entre si — a mesma "Camera" apareceria
-- catalogada num lugar e sem categoria no outro. E, como a jornada agrupa por
-- recurso e categoria, dois pacotes de camera no mesmo aparelho voltariam a
-- render duas linhas "Camera".
do $$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='device_journey';

  if position('c.category                      as categoria' in def) = 0 then
    raise exception 'device_journey mudou; revisar antes de trocar';
  end if;

  def := replace(
    def,
    'c.category                      as categoria',
    'public.categoria_do_app(e.package) as categoria');
  execute def;
end $$;
