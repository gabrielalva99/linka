-- A versão publicada passa a poder mirar UM TIPO de aparelho.
--
-- ── O PROBLEMA ─────────────────────────────────────────────────────────────
-- Hoje existe UMA versão vigente para a frota inteira, de todos os clientes — a
-- tela de versões diz isso em voz alta, e o índice único abaixo garantia. Com o
-- box de TV entrando na MESMA frota (mesmo APK), cada tentativa no box obrigaria
-- os 250 aparelhos de loja a baixar a atualização e reiniciar a vitrine junto.
-- Publicar deixaria de ser uma decisão e viraria um risco.
--
-- E vale mesmo que a TV não saia do papel: é o CANÁRIO que não existe hoje.
-- Subir uma versão em dois aparelhos de mesa antes dos 250 é a rede que faltava
-- — e a frota já provou que uma versão ruim em campo custa visita com cabo.
--
-- ── O DESENHO ──────────────────────────────────────────────────────────────
-- `target_device_type` NULO = vale para todos. É o que já existe hoje, então
-- nenhuma linha precisa ser migrada e nada muda de comportamento sozinho.
-- PREENCHIDO = vale só para aquele tipo, e VENCE da geral.
--
-- "Mais específico ganha" é a mesma regra que a campanha já usa para escolher
-- entre alvo por rede, loja, modelo e aparelho. Uma regra a menos para alguém
-- ter que aprender.

alter table public.agent_releases
  add column if not exists target_device_type public.device_type;

comment on column public.agent_releases.target_device_type is
  'Tipo de aparelho que esta versão atinge. Nulo = toda a frota. Preenchido vence da versão geral para aquele tipo.';

-- Uma atual POR ALVO, e não uma atual no mundo.
--
-- São DOIS índices, e não um com coalesce, porque o Postgres recusa converter
-- enum para texto dentro de índice (o cast não é imutável: rótulo de enum pode
-- ser renomeado). Separados, cada um diz uma frase inteira:
--
--   1. no máximo UMA versão geral vigente  — mesmo desenho do índice antigo
--   2. no máximo UMA versão vigente por tipo de aparelho
--
-- O nulo precisa do índice próprio porque, para o Postgres, dois nulos são
-- distintos: sem a regra 1 daria para publicar duas versões gerais ao mesmo
-- tempo, que é o buraco que isto existe para tampar.
drop index if exists public.agent_releases_one_current;

create unique index if not exists agent_releases_one_current_geral
  on public.agent_releases (is_current)
  where is_current and target_device_type is null;

create unique index if not exists agent_releases_one_current_por_tipo
  on public.agent_releases (target_device_type)
  where is_current and target_device_type is not null;

-- ── Quem decide qual versão é a deste aparelho ─────────────────────────────
--
-- Mora no banco, e não em cada chamador, porque são TRÊS chamadores hoje (o
-- conteúdo do agente, a lista de aparelhos do painel e o kit de provisionamento)
-- e a regra precisa ser a mesma nos três. Espalhada, ela vira três regras que
-- concordam até o dia em que não concordam mais.
--
-- security invoker de propósito: quem chama sem sessão (o kit) enxerga só o que
-- a política de anônimo já permite — a versão vigente, que é pública porque o
-- próprio APK no bucket é aberto.
create or replace function public.release_atual(tipo public.device_type default null)
returns table (version text, url text, target_device_type public.device_type)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.version, r.url, r.target_device_type
  from public.agent_releases r
  where r.is_current
    and (r.target_device_type is null or r.target_device_type = tipo)
  -- Específico primeiro: o aparelho com versão mirada nunca cai na geral.
  order by (r.target_device_type is not null) desc
  limit 1;
$$;

comment on function public.release_atual(public.device_type) is
  'Versão vigente para um tipo de aparelho: a mirada nele, ou a geral se não houver.';
