-- LINKA - o vigia do rollup passa a olhar as tres tabelas, contando igual a elas.
--
-- Ele nasceu junto com o rollup de visitas e olhava so ela. Com recurso e midia
-- entrando, um vigia de um terco e pior do que parece: continuaria dizendo "nada
-- pendente" com a midia de um dia inteiro faltando, e o relatorio mostraria
-- vitrine sem as paradas correspondentes. Buraco silencioso com vigia aceso e o
-- pior dos dois mundos.
--
-- DROP e nao REPLACE porque as colunas mudaram - ele agora diz QUAL rollup
-- faltou, e nao so que faltou. Conferido antes de derrubar: nenhuma view, funcao
-- ou tela do painel depende dele.
--
-- -- ELE APITOU ERRADO NO PRIMEIRO MINUTO, E ISSO ENTROU NO ARQUIVO ---------
-- A primeira versao acusou "30/07 sem rollup de recurso". Nao era buraco: aquele
-- dia teve DOIS eventos de uso, os dois de launcher (com.motorola.launcher3 e o
-- da tela secundaria), que o catalogo marca como ruido. O preenchimento filtra
-- ruido; o vigia contava evento cru. Zero linhas era a resposta certa.
--
-- E a mesma armadilha do dia inteiro, na terceira aparicao: a mesma regra escrita
-- em dois lugares, e um deles nao acompanha. Ja custou hoje um aviso de bloqueio
-- mentindo por dois dias e um alerta de travas acusando quem estava certo. Num
-- vigia o estrago e o pior possivel: ele vira barulho de fundo, e no dia de uma
-- falta de verdade ninguem olha.
--
-- A contagem abaixo e copia condicao por condicao do `bruto` de
-- preencher_rollup_dia: showcase sempre conta; uso so conta se nao for ruido;
-- midia nao tem filtro de ruido.
--
-- -- DUAS COISAS QUE ELE NAO ACUSA, DE PROPOSITO ---------------------------
-- 1. O dia corrente. Ainda esta sendo preenchido (cron todo minuto 7), e acusar
--    algo que se resolve sozinho em minutos e o comeco de todo mundo ignorar.
-- 2. Dia em que TODO video rodou fora do expediente da loja nao gera linha de
--    midia, porque o tempo no ar e recortado pelo horario da loja. Raro, e
--    apareceria aqui como pendencia. Preferi esse risco ao contrario: deixar de
--    avisar quando falta dado e o erro caro.
--
-- Provado nos dois sentidos depois de calibrar: 0 pendencias com tudo cheio, e
-- "2026-07-29: midia" ao apagar a midia daquele dia (teste desfeito em seguida).
drop view if exists public.v_rollup_pendente;

create view public.v_rollup_pendente as
with eventos as (
  select
    e.tenant_id,
    (e.started_at at time zone coalesce(s.timezone, 'America/Sao_Paulo'))::date as dia,
    count(*) filter (
      where e.kind = 'showcase'
         or (e.kind = 'app_usage' and coalesce(c.is_noise, false) = false)
    ) as ev_visita,
    count(*) filter (
      where e.kind = 'app_usage' and coalesce(c.is_noise, false) = false
    ) as ev_recurso,
    count(*) filter (where e.kind = 'media_play') as ev_midia
  from public.device_events e
  join public.devices d on d.id = e.device_id
  left join public.stores s on s.id = d.store_id
  left join public.app_catalog c on c.package = e.package
  where e.kind in ('app_usage','showcase','media_play')
    and not d.exclude_from_reports
  group by 1, 2
),
preenchido as (
  select tenant_id, hora_local::date as dia, 'visita' as qual
    from public.rollup_visita_hora group by 1,2
  union all
  select tenant_id, hora_local::date, 'recurso'
    from public.rollup_recurso_hora group by 1,2
  union all
  select tenant_id, hora_local::date, 'midia'
    from public.rollup_midia_hora group by 1,2
),
faltando as (
  select e.tenant_id, e.dia, x.qual, x.eventos
  from eventos e
  cross join lateral (values
    ('visita',  e.ev_visita),
    ('recurso', e.ev_recurso),
    ('midia',   e.ev_midia)
  ) x(qual, eventos)
  where x.eventos > 0
    and e.dia < (now() at time zone 'America/Sao_Paulo')::date
    and not exists (
      select 1 from preenchido p
      where p.tenant_id = e.tenant_id and p.dia = e.dia and p.qual = x.qual
    )
)
select tenant_id, dia,
       string_agg(qual, ', ' order by qual) as rollup_faltando,
       sum(eventos)::bigint as eventos
from faltando
group by 1, 2;

alter view public.v_rollup_pendente set (security_invoker = on);

comment on view public.v_rollup_pendente is
  'Dias com evento e sem a linha de rollup correspondente, dizendo QUAL das tres faltou. Dia corrente fica de fora (ainda enchendo). Ver migration 20260731180000.';
