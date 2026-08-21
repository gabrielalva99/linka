-- "Aparelho sem nenhuma visita" acusava aparelho que FOI tocado.
--
-- O CASO REAL (20/08). O tablet Samsung recém-provisionado registrou quatro
-- toques no painel de recursos — Som, Brilho da tela, YouTube e Otimização de
-- RAM. Na mesma tela, o relatório dizia:
--
--   "1 aparelho sem nenhuma visita no período
--    Pode ser ponto ruim na loja, pode ser aparelho com problema.
--    Nos dois casos alguém precisa olhar."
--
-- Duas afirmações opostas sobre o mesmo aparelho, uma embaixo da outra. Quem lê
-- não tem como saber qual acreditar — e o alerta manda visitar um aparelho que
-- está funcionando.
--
-- A CAUSA. O alerta procurava só eventos de USO DE OUTRO APP (`app_usage`), que
-- é o que alimenta a contagem de visitas. Só que desde 03/08 existe uma segunda
-- forma de o cliente interagir: tocar num recurso do painel do LINKA
-- (`feature_tap`). Brilho e volume, por exemplo, acontecem DENTRO do nosso app e
-- nunca geram uso de outro app — então um cliente que mexeu nos dois some
-- completamente deste alerta.
--
-- O que o alerta quer dizer é "ninguém encostou neste aparelho". Encostar inclui
-- o menu de recursos.
--
-- NÃO mexe na definição de VISITA de propósito: ela alimenta o BI da ProSolution
-- (CONTRATO-DE-DADOS) e mudar o significado quebraria a comparação com o
-- histórico. O que muda é só quem entra na lista de suspeitos.
do $$
declare
  def text;
  velho text := 'where e.device_id = d.id and e.kind=''app_usage'' and e.started_at >= v_ini_tz';
  novo  text := 'where e.device_id = d.id and e.kind in (''app_usage'',''feature_tap'') and e.started_at >= v_ini_tz';
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fleet_report' and p.prokind = 'f';

  if def is null then
    raise exception 'fleet_report nao encontrada';
  end if;
  if position(velho in def) = 0 then
    raise exception 'o trecho do alerta mudou de forma; conferir antes de reaplicar';
  end if;

  execute replace(def, velho, novo);
end $$;
