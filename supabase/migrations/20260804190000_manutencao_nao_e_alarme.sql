-- LINKA — manutenção aberta deixa de acender alarme vermelho.
--
-- O DEFEITO QUE EU CRIEI HOJE. A saída de manutenção passou a soltar as travas de
-- rede (para o técnico trocar o Wi-Fi da loja), e o aparelho reporta isso com
-- honestidade: as três proteções vão como falsas. O aviso "sem travas" dispara e
-- o painel passa a dizer "permite desligar o Wi-Fi" enquanto o técnico está com o
-- aparelho na mão, fazendo exatamente o que deveria.
--
-- Tecnicamente correto e operacionalmente errado. Alarme que grita durante um
-- procedimento normal ensina a equipe a ignorar a cor vermelha — e aí o aparelho
-- que está de fato desprotegido some no meio do ruído. É o mesmo raciocínio que
-- justificou arquivar aparelho em vez de deixá-lo alarmando para sempre.
--
-- SILENCIAR NÃO É ESCONDER. Se o aviso simplesmente sumisse, a tela mostraria um
-- aparelho impecável enquanto o Wi-Fi dele está aberto para qualquer um desligar.
-- Então "sem travas" cede o lugar a "em manutenção": mesma linha, mesma lista,
-- dizendo o que está acontecendo em vez de acusar um problema que não existe.
--
-- POR QUE NÃO PRECISA DE PRAZO. Um aparelho esquecido em manutenção não fica
-- invisível: a liberação dura 5 minutos no próprio aparelho, e se ele parar de
-- responder no meio, "fora do ar" acende sozinho — esse continua sendo crítico.
--
-- Remendo com âncora, como o dos acentos: a view tem oito ramos de diagnóstico e
-- uma janela de expediente por fuso. Redigitar para mexer em dois pontos é trocar
-- um defeito conhecido por um desconhecido. Aborta se qualquer âncora sumir.
--
-- security_invoker=on repetido de propósito na recriação: sem ele a view rodaria
-- como dona e a RLS por cliente pararia de valer.

do $$
declare
  corpo text;
  de text;
  para text;
  pares text[][] := array[
    -- 1) a coluna precisa atravessar as duas CTEs para chegar aos ramos
    ['d.kiosk_locked,',
     'd.kiosk_locked,
            d.maintenance_open,'],
    ['base.kiosk_locked,',
     'base.kiosk_locked,
            base.maintenance_open,'],
    -- 2) "sem travas" cala a boca enquanto a manutenção está aberta
    ['(NOT comh.is_device_owner OR COALESCE(protecao_de_pe(comh.protecoes), comh.kiosk_locked) = false,''sem_travas''::text,',
     '(NOT COALESCE(comh.maintenance_open, false) AND (NOT comh.is_device_owner OR COALESCE(protecao_de_pe(comh.protecoes), comh.kiosk_locked) = false),''sem_travas''::text,'],
    -- 3) e entra no lugar dele, dizendo o que está acontecendo
    ['nenhuma campanha alcança este aparelho''::text))',
     'nenhuma campanha alcança este aparelho''::text), (COALESCE(comh.maintenance_open, false),''em_manutencao''::text,''atencao''::text,''aberto com o PIN de manutenção na loja; as proteções voltam sozinhas ao fim''::text))']
  ];
  i int;
begin
  corpo := pg_get_viewdef('public.v_device_issues'::regclass, true);

  for i in 1 .. array_length(pares, 1) loop
    de := pares[i][1];
    para := pares[i][2];
    if position(de in corpo) = 0 then
      raise exception
        'ancora nao encontrada em v_device_issues: %. A view mudou — confira antes de remendar.', de;
    end if;
    corpo := replace(corpo, de, para);
  end loop;

  execute 'create or replace view public.v_device_issues with (security_invoker = on) as ' || corpo;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- E o alerta NÃO acompanha.
--
-- Faltou pouco para eu trocar um ruído por outro. `sync_device_alerts` lê esta
-- mesma view e abre uma linha em `device_alerts` para cada tipo que aparecer —
-- que é o que vira aviso para a operação. Sem este filtro, cada técnico que
-- abrisse a manutenção geraria um alerta aberto, depois um "fechou" cinco
-- minutos mais tarde. Eu teria tirado o vermelho da tela e mandado o mesmo
-- barulho por outro canal.
--
-- `em_manutencao` é informação de TELA: serve para quem está olhando o painel
-- naquele instante entender por que as proteções estão abertas. Não é evento
-- que mereça acordar alguém.
--
-- Um único ponto de filtro, na abertura. Fechar continua genérico de propósito:
-- se um alerta desse tipo já existir de uma versão anterior, ele fecha sozinho
-- na primeira passada em vez de ficar preso para sempre.
create or replace function public.sync_device_alerts()
returns table(acao text, alert_id uuid, device_id uuid, device_name text, loja text, kind text, severity text, detail text)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
begin
  -- Fecha o que voltou ao normal.
  return query
  with fechados as (
    update public.device_alerts a
    set closed_at = now()
    where a.closed_at is null
      and not exists (
        select 1 from public.v_device_issues i
        where i.device_id = a.device_id and i.tipo = a.kind
      )
    returning a.id, a.device_id, a.kind, a.severity, a.detail
  )
  select 'fechou'::text, f.id, f.device_id, d.name,
         coalesce(s.name, 'sem loja'), f.kind, f.severity, f.detail
  from fechados f
  join public.devices d on d.id = f.device_id
  left join public.stores s on s.id = d.store_id;

  -- Abre o que é novo. Aparelho de bancada não gera alerta: ele existe para a
  -- gente quebrar. Manutenção aberta também não: é alguém trabalhando.
  return query
  with novos as (
    insert into public.device_alerts (tenant_id, device_id, kind, severity, detail)
    select i.tenant_id, i.device_id, i.tipo, i.gravidade, i.detalhe
    from public.v_device_issues i
    where not i.exclude_from_reports
      and i.tipo <> 'em_manutencao'
    on conflict (device_id, kind) where closed_at is null do nothing
    returning id, device_id, kind, severity, detail
  )
  select 'abriu'::text, n.id, n.device_id, d.name,
         coalesce(s.name, 'sem loja'), n.kind, n.severity, n.detail
  from novos n
  join public.devices d on d.id = n.device_id
  left join public.stores s on s.id = d.store_id;
end;
$function$;
