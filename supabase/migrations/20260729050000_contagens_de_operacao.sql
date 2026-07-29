-- LINKA — contagens de "quantos existem", calculadas no banco.
--
-- POR QUE NO BANCO. Tres telas mostravam o tamanho da operacao contando por
-- dentro do PostgREST (`devices(count)`), que nao aceita filtro: somavam
-- aparelho arquivado e loja desativada. Corrigir no painel exigiria trazer as
-- linhas e contar em JavaScript — e o PostgREST corta a resposta em 1000 linhas.
-- Com a frota alvo (10 mil aparelhos) a contagem passaria a errar EM SILENCIO,
-- que e a mesma doenca que esta varredura foi curar, so mais tarde e mais dificil
-- de achar.
--
-- Agrupado no banco, cada view devolve uma linha por cliente/loja/modelo: dezenas
-- de linhas, nao dezenas de milhares.
--
-- security_invoker = on E OBRIGATORIO. Sem isso a view roda com os direitos de
-- quem a criou e o RLS das tabelas de baixo nao se aplica: um usuario da Motorola
-- veria a contagem de aparelhos de todas as outras marcas. View de contagem
-- parece inofensiva justamente porque nao mostra dado nenhum — mostra tamanho de
-- frota de concorrente, que e informacao comercial.

create or replace view public.v_aparelhos_por_cliente
  with (security_invoker = on) as
  select tenant_id, count(*)::bigint as total
  from public.devices where is_active group by tenant_id;

create or replace view public.v_aparelhos_por_loja
  with (security_invoker = on) as
  select tenant_id, store_id, count(*)::bigint as total
  from public.devices where is_active and store_id is not null
  group by tenant_id, store_id;

create or replace view public.v_aparelhos_por_modelo
  with (security_invoker = on) as
  select tenant_id, model_id, count(*)::bigint as total
  from public.devices where is_active and model_id is not null
  group by tenant_id, model_id;

create or replace view public.v_lojas_por_cliente
  with (security_invoker = on) as
  select tenant_id, count(*)::bigint as total
  from public.stores where is_active group by tenant_id;

create or replace view public.v_lojas_por_rede
  with (security_invoker = on) as
  select tenant_id, chain_id, count(*)::bigint as total
  from public.stores where is_active and chain_id is not null
  group by tenant_id, chain_id;

comment on view public.v_aparelhos_por_cliente is 'Aparelhos EM OPERACAO por cliente (arquivado nao conta).';
comment on view public.v_aparelhos_por_loja is 'Aparelhos EM OPERACAO por loja.';
comment on view public.v_aparelhos_por_modelo is 'Aparelhos EM OPERACAO por modelo.';
comment on view public.v_lojas_por_cliente is 'Lojas ATIVAS por cliente.';
comment on view public.v_lojas_por_rede is 'Lojas ATIVAS por rede.';

grant select on public.v_aparelhos_por_cliente to authenticated;
grant select on public.v_aparelhos_por_loja to authenticated;
grant select on public.v_aparelhos_por_modelo to authenticated;
grant select on public.v_lojas_por_cliente to authenticated;
grant select on public.v_lojas_por_rede to authenticated;
