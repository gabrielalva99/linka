-- Acesso de leitura para a ferramenta de BI, sem nenhuma chance de escrita.
--
-- ── O QUE ISTO RESOLVE ──────────────────────────────────────────────────────
-- O time de BI vai apontar Power BI (e provavelmente uma IA) para os dados do
-- LINKA. O risco nao e ele VER o que nao deve: ele e socio e ve tudo. O risco e
-- ESCRITA. Uma IA confusa com credencial de escrita apaga tabela, roda migration
-- ou derruba a frota as 23h, e nenhuma instrucao no prompt impede isso.
--
-- A resposta nao e instrucao, e permissao. Este papel so sabe fazer SELECT em
-- cinco visoes. Um `delete` dele volta `permission denied` do proprio Postgres,
-- sem depender de prompt, de modelo nem de bom senso de ninguem.
--
-- ── POR QUE UM ESQUEMA NOVO, E NAO AS v_bi_* DO PUBLIC ──────────────────────
-- As v_bi_* sao security_invoker: filtram pelo cliente de QUEM ESTA LOGADO. Uma
-- conexao direta de banco nao tem usuario logado, entao elas devolveriam zero
-- linha. As visoes daqui rodam como o dono e enxergam todos os clientes, que e o
-- certo para um socio.
--
-- ATENCAO NO DIA DA SEGUNDA MARCA: este papel vai enxergar a marca nova tambem.
-- Hoje so existe Motorola e o cliente Teste. Quando entrar concorrente, este
-- esquema precisa voltar a filtrar por cliente, e isso NAO acontece sozinho.
--
-- ── O QUE ELE NAO ALCANCA ───────────────────────────────────────────────────
-- Nada do esquema `public`: nem devices, nem token de aparelho, nem contato de
-- loja com telefone, nem audit_log, nem o cofre. Nao e restricao por politica, e
-- ausencia de permissao: o papel nao tem nem USAGE no public.
create schema if not exists bi;

comment on schema bi is
  'Somente leitura, para ferramenta de BI externa. Nada aqui escreve, e o papel bi_prosolution nao enxerga o esquema public.';

-- Sem security_invoker DE PROPOSITO (ao contrario de tudo no public): e o que
-- faz a visao rodar como dona e devolver linha para uma conexao sem usuario
-- logado. Escrito aqui porque a casa ja quebrou uma vez por causa de
-- security_invoker perdido, e o leitor precisa ver que aqui a ausencia e
-- deliberada.
create or replace view bi.interaction_hourly as
  select * from public.v_bi_interaction_hourly;
create or replace view bi.visits_hourly as
  select * from public.v_bi_visits_hourly;
create or replace view bi.showcase_hourly as
  select * from public.v_bi_showcase_hourly;
create or replace view bi.media_hourly as
  select * from public.v_bi_media_hourly;
create or replace view bi.feature_taps_hourly as
  select * from public.v_bi_feature_taps_hourly;

alter view bi.interaction_hourly  set (security_invoker = off);
alter view bi.visits_hourly       set (security_invoker = off);
alter view bi.showcase_hourly     set (security_invoker = off);
alter view bi.media_hourly        set (security_invoker = off);
alter view bi.feature_taps_hourly set (security_invoker = off);

-- O papel. A senha nasce aqui dentro e vai direto para o cofre: assim ela nunca
-- existe no arquivo de migration, no repositorio nem em conversa.
do $$
declare
  v_senha text;
begin
  if not exists (select 1 from pg_roles where rolname = 'bi_prosolution') then
    v_senha := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    execute format(
      'create role bi_prosolution login password %L
         nosuperuser nocreatedb nocreaterole noinherit nobypassrls
         connection limit 5',
      v_senha
    );
    perform public.guardar_segredo('bi_prosolution_senha', v_senha);
  end if;
end $$;

-- Consulta pesada de BI nao pode competir com 250 aparelhos batendo de minuto em
-- minuto. Um minuto e muito para relatorio e pouco para varredura acidental.
alter role bi_prosolution set statement_timeout = '60s';
alter role bi_prosolution set idle_in_transaction_session_timeout = '60s';

-- O unico lugar onde ele entra, e so para ler.
grant usage on schema bi to bi_prosolution;
grant select on all tables in schema bi to bi_prosolution;
alter default privileges in schema bi grant select on tables to bi_prosolution;

-- Explicito, mesmo sendo o padrao: escrever e criar estao fora.
revoke create on schema bi from bi_prosolution;
revoke all on schema public from bi_prosolution;
