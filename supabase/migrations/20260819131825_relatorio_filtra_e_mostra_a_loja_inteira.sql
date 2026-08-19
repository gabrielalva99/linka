-- O relatorio passa a usar a identidade completa da loja, para exibir E filtrar.
--
-- O ESTRAGO INTERMEDIARIO QUE ISTO FECHA: na migration de numero anterior eu
-- troquei quatro filtros para nome_completo_da_loja(s.id) e deixei os blocos
-- que leem as views de BI comparando pelo nome curto. Com filtro de loja
-- aplicado, os dois lados discordavam e o relatorio devolveria numeros de
-- recortes diferentes na mesma tela. Corrigir pela metade e pior que nao
-- corrigir, porque continua parecendo certo.
do $$
declare
  def text;
  n_filtro int;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='fleet_report';

  select count(*) into n_filtro from regexp_matches(def, 'p_loja is null or loja = p_loja', 'g');
  if n_filtro <> 7 then
    raise exception 'fleet_report mudou (filtros de BI=%); revisar antes de trocar', n_filtro;
  end if;

  def := replace(def, 'p_loja is null or loja = p_loja',
                      'p_loja is null or loja_completa = p_loja');

  def := replace(def,
    'select coalesce(v.loja,''sem loja'') as loja, coalesce(v.rede,''sem rede'') as rede,',
    'select coalesce(v.loja_completa,''sem loja'') as loja, coalesce(v.rede,''sem rede'') as rede,');
  def := replace(def,
    'select coalesce(v.codigo,'''') as codigo, v.aparelho, coalesce(v.loja,''sem loja'') as loja,',
    'select coalesce(v.codigo,'''') as codigo, v.aparelho, coalesce(v.loja_completa,''sem loja'') as loja,');

  def := replace(def,
    'select coalesce(loja,''sem loja'') as loja, sum(segundos_vitrine) as segundos',
    'select coalesce(loja_completa,''sem loja'') as loja, sum(segundos_vitrine) as segundos');

  execute def;
end $$;
