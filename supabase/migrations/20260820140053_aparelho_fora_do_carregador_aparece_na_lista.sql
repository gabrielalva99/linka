-- Aparelho fora do carregador passa a aparecer na lista.
--
-- O CASO (19/08, Casas Bahia Interlagos): faltou energia à noite. Os doze
-- aparelhos que estavam na base perderam só a rede e voltaram sozinhos quando a
-- luz voltou. O Moto G06 estava fora do carregador, descarregou no escuro e não
-- voltou — precisou de alguém apertar o botão de ligar no dia seguinte, e a
-- vitrine passou a manhã inteira apagada.
--
-- O aviso de bateria baixa não pegou nada: ele calou com 86%, porque o que caiu
-- primeiro foi o Wi-Fi da loja, não a bateria dele. Quando a bateria realmente
-- acabou, já não havia rede para contar. Um alerta que só olha o nível nunca vê
-- este caso.
--
-- A FOLGA DE 30 MINUTOS separa demonstração de esquecimento. Cliente com o
-- aparelho na mão é o trabalho da vitrine acontecendo; meia hora fora da base é
-- outra coisa. Sem essa folga, cada demonstração viraria alarme, e alarme que
-- não fecha ensina a equipe a ignorar a tela inteira.
--
-- SÓ ACUSA QUEM ESTÁ FALANDO. Aparelho fora do ar já tem o aviso dele, e dois
-- avisos para o mesmo aparelho desligado é ruído.
do $$
declare
  def text;
  n int;
  ancoras text[] := array[
    '            d.battery_charging,',
    '            base.battery_charging,',
    ') t(vale, tipo, gravidade, detalhe)'
  ];
  a text;
begin
  select pg_get_viewdef('public.v_device_issues'::regclass, true) into def;

  -- ÂNCORA REPETIDA JÁ QUEBROU ESTE BANCO. Um replace de texto solto num corpo
  -- de função atingiu quatro blocos parecidos e derrubou a geração de
  -- relatórios inteira. Aqui cada âncora precisa ser única, ou nada roda.
  foreach a in array ancoras loop
    n := (length(def) - length(replace(def, a, ''))) / length(a);
    if n <> 1 then
      raise exception 'ancora % aparece % vezes (esperado 1); revisar antes de recriar', a, n;
    end if;
  end loop;

  def := replace(def, '            d.battery_charging,',
                      '            d.battery_charging,
            d.fora_da_tomada_desde,');
  def := replace(def, '            base.battery_charging,',
                      '            base.battery_charging,
            base.fora_da_tomada_desde,');

  def := replace(
    def,
    ') t(vale, tipo, gravidade, detalhe)',
    ', (comh.battery_charging IS FALSE
        AND comh.fora_da_tomada_desde IS NOT NULL
        AND comh.fora_da_tomada_desde < (now() - ''30 minutes''::interval)
        AND comh.last_seen_at >= (now() - comh.tolerancia),
       ''fora_da_tomada''::text, ''atencao''::text,
       (''fora do carregador há '' ||
         case
           when now() - comh.fora_da_tomada_desde < ''90 minutes''::interval
             then (extract(epoch from now() - comh.fora_da_tomada_desde) / 60)::int::text || '' min''
           else round(extract(epoch from now() - comh.fora_da_tomada_desde) / 3600.0)::text || '' h''
         end
         || coalesce('' ('' || comh.battery_level || ''%)'', ''''))
      )) t(vale, tipo, gravidade, detalhe)'
  );

  execute 'create or replace view public.v_device_issues as ' || def;
end $$;

-- Recriar a view DERRUBA isto, e sem ele a view passa a enxergar com os olhos
-- de quem a criou: um cliente veria os alertas do outro.
alter view public.v_device_issues set (security_invoker = on);
