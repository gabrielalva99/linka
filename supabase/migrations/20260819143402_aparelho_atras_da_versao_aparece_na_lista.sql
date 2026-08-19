-- Aparelho que ficou para tras na versao passa a aparecer na lista.
--
-- O CASO (19/08): o Moto G06 da Casas Bahia ficou horas na 0.81.0 enquanto os
-- outros doze subiram para a 0.87.0. Estava ONLINE, dono do aparelho, quiosque
-- preso, sem erro nenhum registrado — e o painel nao tinha uma linha sequer
-- sobre isso. O Gabriel descobriu comparando versoes na tela de frota.
--
-- Este aviso nao depende do agente contar nada: o servidor sabe qual e a versao
-- atual e qual o aparelho reporta.
--
-- A FOLGA DE DUAS HORAS existe para o aviso nao nascer junto com a publicacao:
-- uma frota inteira leva minutos para atualizar, e acusar todo mundo durante a
-- janela normal ensinaria a ignorar o aviso.
--
-- So acusa quem esta FALANDO. Aparelho fora do ar ja aparece como fora do ar, e
-- dois avisos para o mesmo aparelho desligado e ruido.
do $$
declare def text;
begin
  select pg_get_viewdef('public.v_device_issues'::regclass, true) into def;

  if position('            d.update_error,' in def) = 0
     or position(') t(vale, tipo, gravidade, detalhe)' in def) = 0 then
    raise exception 'a estrutura esperada da view mudou; revisar antes de recriar';
  end if;

  def := replace(def, '            d.update_error,',
                      '            d.update_error,
            d.agent_version,
            ( SELECT r.version FROM agent_releases r WHERE r.is_current LIMIT 1) AS versao_atual,
            ( SELECT r.created_at FROM agent_releases r WHERE r.is_current LIMIT 1) AS versao_desde,');
  def := replace(def, '            base.update_error,',
                      '            base.update_error,
            base.agent_version,
            base.versao_atual,
            base.versao_desde,');

  def := replace(
    def,
    ') t(vale, tipo, gravidade, detalhe)',
    ', (comh.versao_atual IS NOT NULL
        AND comh.agent_version IS NOT NULL
        AND comh.agent_version <> comh.versao_atual
        AND comh.versao_desde < (now() - ''2 hours''::interval)
        AND comh.last_seen_at >= (now() - comh.tolerancia),
       ''versao_atrasada''::text, ''atencao''::text,
       (''continua na versao '' || comh.agent_version || '', e a publicada e a '' || comh.versao_atual)
      )) t(vale, tipo, gravidade, detalhe)'
  );

  execute 'create or replace view public.v_device_issues as ' || def;
end $$;

alter view public.v_device_issues set (security_invoker = on);
