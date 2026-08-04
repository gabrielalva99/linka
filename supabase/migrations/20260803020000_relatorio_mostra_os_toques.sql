-- LINKA - o relatorio ganha os toques do painel de recursos.
--
-- A migration anterior (20260803010000) levou o toque ate o rollup e a view de
-- BI. Faltava a ponta que o cliente ve: fleet_report, que e de onde a tela de
-- Relatorios tira tudo. Sem esta parte, o numero existe no banco e nao existe
-- para ninguem.
--
-- DOIS RECORTES, E O SEGUNDO E O QUE VENDE:
--
--   por_toque         - quantos quiseram testar cada recurso.
--   por_toque_modelo  - o mesmo, separado por aparelho.
--
-- O segundo e a frase que nenhum concorrente entrega: "382 clientes testaram a
-- camera no Razr contra 41 no G06". Isso orienta sortimento e treinamento de
-- loja, e sai de graca porque o rollup ja guarda por aparelho.
--
-- ORDENADO POR TOQUES, e nao por segundos: aqui nao HA segundos. Copiar o
-- "order by segundos" das secoes vizinhas ordenaria por uma coluna inexistente
-- e o Postgres so reclamaria na hora da chamada.
--
-- -- CIRURGIA, PELO MESMO MOTIVO DE SEMPRE ------------------------------------
-- fleet_report tem 13 mil caracteres e ja pregou a peca de ter no banco uma
-- assinatura diferente da que o arquivo de migration descrevia. Aqui a fonte da
-- verdade e pg_get_functiondef e as ancoras sao conferidas antes: se alguma
-- mudou, a migration para com erro em vez de aplicar pela metade.
do $cirurgia$
declare
  v_def  text;
  v_nova text;
  v_cte_ancora constant text :=
    '  uso as (' || E'\n' ||
    '    select * from public.v_bi_interaction_hourly where hora_local >= v_ini' || E'\n' ||
    '      and (p_rede is null or rede = p_rede) and (p_loja is null or loja = p_loja)' || E'\n' ||
    '      and (p_aparelho is null or codigo = p_aparelho)' || E'\n' ||
    '      and (p_tenant is null or tenant_id = p_tenant)),';
  v_json_ancora constant text :=
    '    ''por_recurso'', (select coalesce(jsonb_agg(x order by x.segundos desc),''[]''::jsonb)' || E'\n' ||
    '      from (select recurso, categoria, sum(sessoes) as sessoes, sum(segundos) as segundos' || E'\n' ||
    '            from uso group by 1,2) x),';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fleet_report';

  if v_def is null then
    raise exception 'fleet_report nao existe: nada a costurar';
  end if;

  if position('por_toque' in v_def) > 0 then
    raise notice 'fleet_report ja devolve os toques; nada a fazer';
    return;
  end if;

  if position(v_cte_ancora in v_def) = 0 then
    raise exception 'ancora do CTE de uso mudou: revisar a costura antes de aplicar';
  end if;
  if position(v_json_ancora in v_def) = 0 then
    raise exception 'ancora de por_recurso mudou: revisar a costura antes de aplicar';
  end if;

  -- (a) a fonte: mesma janela e mesmos filtros das irmas, sem excecao. Filtro
  --     que nao acompanha e a maneira mais rapida de uma tela filtrada por loja
  --     mostrar o numero da rede inteira num quadro so.
  v_nova := replace(
    v_def,
    v_cte_ancora,
    v_cte_ancora || E'\n' ||
    '  toque as (' || E'\n' ||
    '    select * from public.v_bi_feature_taps_hourly where hora_local >= v_ini' || E'\n' ||
    '      and (p_rede is null or rede = p_rede) and (p_loja is null or loja = p_loja)' || E'\n' ||
    '      and (p_aparelho is null or codigo = p_aparelho)' || E'\n' ||
    '      and (p_tenant is null or tenant_id = p_tenant)),'
  );

  -- (b) os dois recortes, logo depois do primo que mede tempo.
  v_nova := replace(
    v_nova,
    v_json_ancora,
    v_json_ancora || E'\n' ||
    '    ''por_toque'', (select coalesce(jsonb_agg(x order by x.toques desc),''[]''::jsonb)' || E'\n' ||
    '      from (select recurso, sum(toques) as toques' || E'\n' ||
    '            from toque group by 1) x),' || E'\n' ||
    '    ''por_toque_modelo'', (select coalesce(jsonb_agg(x order by x.toques desc),''[]''::jsonb)' || E'\n' ||
    '      from (select coalesce(modelo,''sem modelo'') as modelo, recurso,' || E'\n' ||
    '                   sum(toques) as toques' || E'\n' ||
    '            from toque group by 1,2) x),'
  );

  execute v_nova;
end;
$cirurgia$;
