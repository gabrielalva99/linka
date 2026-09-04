-- Conserta o esquema `bi` criado minutos antes, que nao funcionava.
--
-- ── O ERRO ──────────────────────────────────────────────────────────────────
-- As visoes de `bi` faziam `select * from public.v_bi_*`, contando que uma visao
-- "dona" (sem security_invoker) chamando outra fizesse a de dentro rodar como
-- dona tambem. Nao faz. `security_invoker` continua checando o usuario ORIGINAL,
-- por mais camadas que existam no meio. O papel de leitura bateu em
-- `permission denied for table rollup_midia_hora` na primeira consulta.
--
-- ── O CONSERTO ──────────────────────────────────────────────────────────────
-- As visoes de `bi` passam a ter a MESMA definicao das v_bi_*, lendo as tabelas
-- direto. Como sao donas do postgres, o RLS nao se aplica, que e o certo para um
-- socio que enxerga todos os clientes.
--
-- ── POR QUE GERADO, E NAO COPIADO NA MAO ────────────────────────────────────
-- Copiar cinco definicoes na mao cria duas verdades: mudo a v_bi_* do painel e o
-- BI passa a ler outra coisa, silenciosamente, ate alguem perceber que o numero
-- nao bate. `bi.espelhar()` gera as visoes A PARTIR das do painel, entao a
-- definicao continua morando num lugar so. Depois de mexer em qualquer v_bi_*,
-- rode `select bi.espelhar();`.
drop view if exists bi.interaction_hourly cascade;
drop view if exists bi.visits_hourly cascade;
drop view if exists bi.showcase_hourly cascade;
drop view if exists bi.media_hourly cascade;
drop view if exists bi.feature_taps_hourly cascade;

create or replace function bi.espelhar()
returns int
language plpgsql
set search_path to 'bi', 'public', 'pg_catalog'
as $$
declare
  v record;
  v_destino text;
  v_n int := 0;
begin
  for v in
    select viewname,
           pg_get_viewdef(('public.' || quote_ident(viewname))::regclass, true) as def
      from pg_views
     where schemaname = 'public' and viewname like 'v\_bi\_%'
     order by viewname
  loop
    -- Nome sem o prefixo: o esquema ja diz que e BI.
    v_destino := replace(v.viewname, 'v_bi_', '');
    execute format('drop view if exists bi.%I cascade', v_destino);
    execute format('create view bi.%I as %s', v_destino, v.def);
    -- Explicito: e a ausencia de security_invoker que faz a visao enxergar
    -- todos os clientes para uma conexao sem usuario logado.
    execute format('alter view bi.%I set (security_invoker = off)', v_destino);
    execute format('grant select on bi.%I to bi_prosolution', v_destino);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

comment on function bi.espelhar() is
  'Regera as visoes de bi a partir das v_bi_* do public. Rode depois de alterar qualquer v_bi_*.';

revoke all on function bi.espelhar() from public;

-- Espelho velho e pior que espelho ausente: o BI continua respondendo, com
-- numero errado. Esta funcao acusa a diferenca de colunas, que e o que quebra
-- uma dashboard de verdade.
create or replace function bi.espelho_desatualizado()
returns table(visao text, problema text)
language sql
stable
set search_path to 'bi', 'public', 'pg_catalog'
as $$
  with painel as (
    select c.relname::text as nome,
           string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attnum) as assinatura
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
     where n.nspname = 'public' and c.relkind = 'v' and c.relname like 'v\_bi\_%'
     group by c.relname
  ),
  espelho as (
    select c.relname::text as nome,
           string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attnum) as assinatura
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
     where n.nspname = 'bi' and c.relkind = 'v'
     group by c.relname
  )
  select p.nome,
         case when e.nome is null then 'nao existe no esquema bi'
              else 'colunas diferentes das do painel' end
    from painel p
    left join espelho e on e.nome = replace(p.nome, 'v_bi_', '')
   where e.nome is null or e.assinatura is distinct from p.assinatura;
$$;

comment on function bi.espelho_desatualizado() is
  'Lista visao de BI que sumiu ou mudou de colunas em relacao ao painel. Vazio = espelho em dia.';

revoke all on function bi.espelho_desatualizado() from public;

select bi.espelhar();

-- Corrige o que o comentario anterior afirmava errado: o papel TEM usage no
-- esquema public, porque o proprio Postgres concede isso a todo mundo e revogar
-- afetaria os papeis do Supabase. O que ele nao tem e permissao de leitura em
-- nenhuma tabela ou visao de la, que na pratica da no mesmo: ele entra no
-- esquema e nao consegue ler uma linha sequer.
comment on schema bi is
  'Somente leitura, para ferramenta de BI externa. O papel bi_prosolution le apenas estas visoes: nao tem SELECT em nenhum objeto do public, nem escrita em lugar nenhum.';
