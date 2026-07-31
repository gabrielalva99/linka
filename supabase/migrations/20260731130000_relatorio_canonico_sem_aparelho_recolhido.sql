-- LINKA - duas coisas no relatorio, achadas na varredura de 31/07.
--
-- 1. APARELHO RECOLHIDO NAO E TAREFA ABERTA (decisao do Gabriel, 31/07).
--
-- As duas telas discordavam sobre quem conta: a lista de pendencias filtra
-- is_active; o relatorio, nao. Cinco aparelhos arquivados ("Substituido",
-- "Trocado") seguiam alimentando "app proibido aberto" - o 113 estava preso
-- com um aviso de 29/07 que nunca fecharia, porque aparelho recolhido nao tem
-- como ser consertado. Aviso que nunca fecha ensina a ignorar aviso.
--
-- A LINHA QUE SEPARA: visita e uso que aconteceram, aconteceram - historico
-- continua contando arquivado, e relatorio de marco continua batendo depois que
-- o aparelho sai de linha (as views de BI nao mudam). O que muda e so a lista
-- de TAREFAS (proibidos abertos/corrigidos): tarefa e sobre o presente, e no
-- presente o aparelho nao esta mais na loja. "aparelhos_sem_visita" ja filtrava
-- (migration numeros_de_uma_so_verdade); o proibidos tinha ficado para tras.
--
-- 2. O ARQUIVO LOCAL DA 20260731060000 DESCREVE UMA FUNCAO QUE NAO E A DO AR.
--
-- No banco, fleet_report e UMA funcao de cinco parametros (com p_tenant, da
-- migration relatorio_por_cliente). O arquivo local da 060000 recria uma de
-- QUATRO - uma foto velha que copiei sem conferir a assinatura viva. No ar nao
-- ha estrago (a 060000 remota foi aplicada como troca cirurgica na funcao
-- certa), mas num rebuild a partir dos arquivos nasceriam DUAS fleet_report, e
-- o bloco cirurgico da 110000 escolheria uma delas por sorteio e falharia.
--
-- Este arquivo e o ponto de convergencia: derruba a copia de quatro parametros
-- se existir (no ar e um no-op) e reescreve a de cinco a partir do que estiver
-- publicado, aplicando por cima as duas mudancas finais - o criterio de
-- corrigido lendo a prova do aparelho (qualquer que seja a forma anterior) e o
-- filtro de arquivado no proibidos. Forma desconhecida = falha alto, nunca
-- aplica pela metade.

drop function if exists public.fleet_report(integer, text, text, text);

do $migr$
declare
  v_def text;
  -- As tres formas conhecidas do criterio de "corrigido", da mais nova para a
  -- mais velha. f1 e a do rebuild (esconde-Ajustes); f2 a da troca de 31/07 de
  -- manha; f3 a final, lendo a prova reportada pelo aparelho.
  f1 constant text := $q$bool_and(d.block_settings and coalesce(d.blocked_apps,'') like '%settings%') as corrigido$q$;
  f2 constant text := $q$bool_and(d.block_settings and coalesce(d.blocked_apps,'') like '%vending%') as corrigido$q$;
  f3 constant text := $q$bool_and(coalesce(public.protecao_de_pe(d.protecoes), d.block_settings and coalesce(d.blocked_apps,'') like '%vending%')) as corrigido$q$;
  -- O filtro de arquivado no proibidos. Ancorado no v_ini_tz porque essa
  -- combinacao aparece uma unica vez na funcao inteira.
  a1 constant text := $q$and e.started_at >= v_ini_tz and not d.exclude_from_reports$q$;
  n1 constant text := $q$and e.started_at >= v_ini_tz and d.is_active and not d.exclude_from_reports$q$;
begin
  -- Assinatura completa, nunca so o nome: com duas copias no banco, escolher
  -- por proname e sorteio - foi exatamente o que quase quebrou o rebuild.
  v_def := pg_get_functiondef('public.fleet_report(integer,text,text,text,uuid)'::regprocedure);

  if position(f3 in v_def) = 0 then
    if position(f2 in v_def) > 0 then v_def := replace(v_def, f2, f3);
    elsif position(f1 in v_def) > 0 then v_def := replace(v_def, f1, f3);
    else raise exception 'criterio de corrigido em forma desconhecida - conferir antes de trocar';
    end if;
  end if;

  if position(n1 in v_def) = 0 then
    if position(a1 in v_def) = 0 then
      raise exception 'filtro do proibidos em forma desconhecida - conferir antes de trocar';
    end if;
    v_def := replace(v_def, a1, n1);
  end if;

  execute v_def;
end $migr$;
