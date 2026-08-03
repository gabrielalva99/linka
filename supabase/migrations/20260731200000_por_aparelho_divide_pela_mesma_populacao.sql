-- LINKA - "por aparelho" parava de dividir uma populacao pela outra.
--
-- VISTO NA TELA, no relatorio de 7 dias: "Razr 60 Ultra - 2 unidades - 15
-- visitas - 7,5 por aparelho". As 15 visitas sairam de QUATRO aparelhos (114,
-- 110, 113 e 109), e tres deles estao arquivados; so o 114 continua ativo. O
-- divisor contava a frota de AGORA, o dividendo contava o periodo INTEIRO.
-- Nenhum aparelho fez 7,5 visitas: o numero nao descreve nada.
--
-- E o relatorio VENDE esse numero como a comparacao justa - a legenda embaixo da
-- tabela diz "a taxa e o que compara modelos com quantidades diferentes na rua;
-- contagem crua premia quem tem mais aparelhos expostos". Justamente a linha que
-- devia corrigir o vies estava com o vies dentro.
--
-- NAO E CULPA DE MISTURAR HISTORICO COM FROTA, que e proposital e correto: visita
-- que aconteceu, aconteceu, e relatorio de marco tem de continuar batendo depois
-- que o aparelho sai de linha. O erro nasce no momento de DIVIDIR: ai as duas
-- pontas precisam falar da mesma populacao.
--
-- O DIVISOR CERTO e "aparelhos deste modelo que estiveram EXPOSTOS no periodo" -
-- que ja existe pronto na CTE `vitrine` (tempo de vitrine dentro do expediente).
-- Ele e melhor que as duas alternativas obvias:
--   . frota de agora  -> era o defeito;
--   . aparelhos que tiveram visita -> premia o modelo cujos aparelhos ficaram
--     parados, porque some do divisor justamente quem nao chamou atencao.
-- Aparelho que ficou na vitrine e nao recebeu ninguem CONTINUA no divisor, que e
-- exatamente o que faz a taxa significar alguma coisa.
--
-- Volta para a contagem de frota quando o periodo nao tem exposicao nenhuma
-- (nullif/coalesce): modelo cadastrado e com os aparelhos desligados apareceria
-- com "0 unidades", que parece defeito. Com visitas zeradas a taxa da zero de
-- qualquer jeito.
--
-- Cirurgico e guardado: a `cobertura por linha` continua saindo do CADASTRO
-- (linha instalada e nunca tocada precisa aparecer), entao `frota` e
-- `capilaridade` ficam intactos. Forma inesperada = falha alto.
--
-- ATENCAO, ACHADO MAIOR NA MESMA INVESTIGACAO: o divisor so ficou visivelmente
-- errado porque um aparelho vivo (115) aparece com ZERO exposicao. A causa esta
-- no agente, nao aqui - sessao de vitrine so e gravada quando alguem INTERROMPE
-- a vitrine, entao aparelho que ninguem toca nao produz hora nenhuma. Ver o
-- relato da investigacao no commit desta migration.
do $migr$
declare
  v_def text;
  a_cte constant text := $a$           count(distinct store_id) as lojas
    from frota group by 1),$a$;
  n_cte constant text := $n$           count(distinct store_id) as lojas
    from frota group by 1),
  expostos as (
    select coalesce(modelo,'sem modelo') as modelo,
           count(distinct codigo) as unidades
    from vitrine group by 1),$n$;
  a_sel constant text := $b$      from (select c.modelo, c.linha, c.unidades, c.lojas,$b$;
  n_sel constant text := $c$      from (select c.modelo, c.linha,
                   coalesce(nullif(e.unidades, 0), c.unidades) as unidades,
                   c.lojas,$c$;
  a_join constant text := $d$            from capilaridade c
            left join visitas_modelo vm2 on vm2.modelo = c.modelo$d$;
  n_join constant text := $e$            from capilaridade c
            left join expostos e on e.modelo = c.modelo
            left join visitas_modelo vm2 on vm2.modelo = c.modelo$e$;
begin
  v_def := pg_get_functiondef('public.fleet_report(integer,text,text,text,uuid)'::regprocedure);

  if position('expostos as (' in v_def) > 0 then
    return;  -- ja aplicado
  end if;
  if position(a_cte in v_def) = 0 or position(a_sel in v_def) = 0
     or position(a_join in v_def) = 0 then
    raise exception 'por_modelo em forma inesperada - conferir antes de trocar';
  end if;

  v_def := replace(v_def, a_cte,  n_cte);
  v_def := replace(v_def, a_sel,  n_sel);
  v_def := replace(v_def, a_join, n_join);
  execute v_def;
end $migr$;
