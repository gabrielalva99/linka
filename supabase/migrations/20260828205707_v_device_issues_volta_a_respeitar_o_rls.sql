-- URGENTE: a v_device_issues voltou a atravessar o RLS.
--
-- ── A REGRESSAO ────────────────────────────────────────────────────────────
-- Em 22/08 a view foi recriada com `create or replace view` para acrescentar o
-- alerta de aplicativo removido, e a opcao `security_invoker` NAO foi
-- reafirmada. O Postgres nao preserva reloptions nesse comando: a view voltou a
-- rodar com os privilegios do dono e a ignorar o RLS das tabelas de base.
--
-- Consequencia medida: qualquer sessao autenticada, inclusive papel de leitura
-- de UMA marca, lia por /rest/v1/v_device_issues o codigo, nome, loja, tipo e
-- gravidade das pendencias de TODOS os clientes.
--
-- ── E A SEGUNDA VEZ ────────────────────────────────────────────────────────
-- Esta e exatamente a classe que o projeto mediu e fechou em 30/07
-- (20260730040000), com ataque real: agencia de um cliente lia 1 linha do outro
-- antes e 0 depois. As recriacoes de 19/08 e 20/08 lembraram de reafirmar. A de
-- 22/08 esqueceu.
--
-- Lembrar nao funcionou. Por isso, alem do conserto, entra abaixo uma funcao que
-- LISTA views desprotegidas, para virar verificacao e nao memoria.
alter view public.v_device_issues set (security_invoker = on);

-- ────────────────────────────────────────────────────────────────────────────
-- O VIGIA: nenhuma view publica pode ficar sem security_invoker.
--
-- Aceita 'on' e 'true', que o Postgres normaliza de formas diferentes conforme
-- como a opcao foi escrita.
create or replace function public.views_sem_security_invoker()
returns table(view_name text, opcoes text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.relname::text,
         coalesce(array_to_string(c.reloptions, ','), 'SEM OPCAO')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and not exists (
      select 1 from unnest(coalesce(c.reloptions, array[]::text[])) o
       where o in ('security_invoker=on', 'security_invoker=true')
    )
  order by 1;
$$;

comment on function public.views_sem_security_invoker() is
  'Views publicas que atravessam o RLS. Tem que voltar vazio. Existe porque "create or replace view" apaga a opcao em silencio, e isso ja aconteceu duas vezes: 30/07 e 22/08.';

revoke all on function public.views_sem_security_invoker() from public, anon, authenticated;
