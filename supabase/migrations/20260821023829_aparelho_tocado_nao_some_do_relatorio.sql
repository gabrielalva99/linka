-- "Por aparelho" fazia um aparelho existente DESAPARECER.
--
-- O CASO REAL (20/08). O tablet Samsung registrou quatro toques no painel de
-- recursos e zero visitas — os dois números certos, porque visita é o cliente
-- SAIR da vitrine e usar outro app. Mas a tabela "Por aparelho" é montada só a
-- partir da lista de visitas, que filtra visitas > 0. Resultado: o aparelho
-- sumia da tabela inteira. Nas palavras do Gabriel: "o tab A7 também é um
-- aparelho e não aparece aqui".
--
-- Uma tela que se chama "Por aparelho" não pode omitir um aparelho que teve
-- interação. Quem lê não descobre que falta alguém — a ausência não tem como
-- ser notada, que é o pior tipo de erro num relatório de cliente.
--
-- O CONSERTO. A lista passa a nascer da UNIÃO de quem teve visita com quem teve
-- toque. Quem só teve toque entra com visita e tempo zerados, o que é a verdade:
-- alguém encostou, ninguém abriu outro app.
--
-- A definição de VISITA continua intacta — ela alimenta o BI da ProSolution e
-- mudar o significado quebraria a comparação com o histórico. O que muda é só
-- quem aparece na lista, não como se conta.
do $$
declare
  def text;
  velho text :=
'  aparelho as (
    select coalesce(v.codigo,'''') as codigo, v.aparelho, coalesce(v.loja_completa,''sem loja'') as loja,
           sum(v.visitas) as visitas, sum(v.segundos_uso) as segundos
    from visitas v group by 1,2,3),';
  novo text :=
'  aparelho as (
    select u.codigo, u.aparelho, u.loja, sum(u.visitas) as visitas, sum(u.segundos) as segundos
    from (
      select coalesce(v.codigo,'''') as codigo, v.aparelho, coalesce(v.loja_completa,''sem loja'') as loja,
             v.visitas, v.segundos_uso as segundos
      from visitas v
      union all
      select coalesce(t.codigo,''''), t.aparelho, coalesce(t.loja_completa,''sem loja''), 0, 0
      from toque t
    ) u group by 1,2,3),';
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fleet_report' and p.prokind = 'f';

  if def is null then raise exception 'fleet_report nao encontrada'; end if;
  if position(velho in def) = 0 then
    raise exception 'a CTE aparelho mudou de forma; conferir antes de reaplicar';
  end if;

  execute replace(def, velho, novo);
end $$;
