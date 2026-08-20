-- Publicar e voltar versão passam a ser UMA operação só.
--
-- ── O ACIDENTE (20/08, 17:23) ──────────────────────────────────────────────
-- Publicar fazia dois passos soltos: tirar a vigente do ar, depois gravar a
-- nova. Quando o segundo falha, o primeiro JÁ ACONTECEU — e a frota fica sem
-- versão publicada sem ninguém pedir isso.
--
-- Foi o que houve: a 0.104.0 foi publicada, o Gabriel clicou publicar de novo,
-- o passo 1 tirou a 0.104.0 do ar, o passo 2 bateu no índice de versão única, e
-- a tela respondeu "Essa versão já existe" — mensagem que soa inofensiva para um
-- estado que já estava quebrado. Só não virou apagão porque o alvo era
-- "smartphone"; com "todos", a 0.103.0 teria saído do ar para os 15 aparelhos.
--
-- O comentário antigo do código dizia que isso não podia ficar órfão. O
-- raciocínio cobria só o caso de permissão negada (que estoura antes), e
-- esquecia o de versão repetida (que estoura DEPOIS). É o tipo de defeito que
-- só aparece quando alguém clica duas vezes — e alguém sempre clica duas vezes.
--
-- ── O CONSERTO ─────────────────────────────────────────────────────────────
-- Os dois passos passam a morar numa função. Função plpgsql é atômica: se o
-- insert estoura, o update volta atrás junto. Não existe mais estado no meio.

create or replace function public.publicar_release(
  p_version text,
  p_url text,
  p_notes text default null,
  p_alvo public.device_type default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- `is not distinct from` e não `=`: no Postgres, `= null` não casa com nada,
  -- então o alvo geral (nulo) afetaria ZERO linhas em silêncio e deixaria duas
  -- vigentes brigando pelo mesmo público.
  update public.agent_releases
     set is_current = false
   where is_current
     and target_device_type is not distinct from p_alvo;

  insert into public.agent_releases (version, url, notes, is_current, target_device_type)
  values (p_version, p_url, nullif(p_notes, ''), true, p_alvo);
end;
$$;

comment on function public.publicar_release(text, text, text, public.device_type) is
  'Publica uma versão para um alvo, tirando a anterior do mesmo alvo do ar. Tudo ou nada.';

-- Voltar para uma versão anterior tinha o mesmo buraco: tira uma do ar, põe
-- outra. Se a segunda falhasse, o alvo ficava sem versão nenhuma.
create or replace function public.tornar_release_vigente(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_alvo public.device_type;
  v_achou boolean;
begin
  select target_device_type, true into v_alvo, v_achou
    from public.agent_releases where id = p_id;
  if not coalesce(v_achou, false) then
    raise exception 'versao nao encontrada' using errcode = 'no_data_found';
  end if;

  -- O alvo sai da versão escolhida, e não de quem clicou: voltar a frota de TV
  -- para uma versão anterior não pode mexer na versão dos celulares.
  update public.agent_releases
     set is_current = false
   where is_current
     and target_device_type is not distinct from v_alvo;

  update public.agent_releases set is_current = true where id = p_id;
end;
$$;

comment on function public.tornar_release_vigente(uuid) is
  'Torna vigente uma versão já publicada, tirando do ar a vigente do mesmo alvo. Tudo ou nada.';
