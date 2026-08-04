-- LINKA — o aviso de "parado no menu" passa a respeitar a configuração do aparelho.
--
-- DEFEITO MEU, de algumas horas atrás, achado na varredura do fim do dia. Eu
-- cravei o limite em 15 minutos raciocinando com o padrão de fábrica: o painel
-- devolve a vitrine em 30 segundos sem toque, então 15 minutos parados só podem
-- ser defeito.
--
-- O que eu não olhei foi a tela que configura isso. `setIdleReturn` aceita de 5
-- segundos a 3600 — uma hora. Um cliente que configure retorno de 30 minutos
-- (perfeitamente legítimo: bancada de aparelho topo de linha, onde a pessoa fica
-- explorando) receberia alarme vermelho aos 15 minutos, TODA vez que alguém
-- usasse o menu. O aviso que nasceu hoje para tirar ruído da tela viraria a maior
-- fonte de ruído dela.
--
-- O limite agora sai da própria configuração do aparelho: três vezes o tempo de
-- retorno, com piso de 15 minutos. Com o padrão de 30s nada muda (3×30s = 90s,
-- perde para o piso). Com 30 minutos configurados, o aviso só vem em 1h30 —
-- tempo em que nenhum cliente de loja ficou, e portanto defeito de verdade.
--
-- TRÊS VEZES, e não uma. O retorno é contado a partir do ÚLTIMO TOQUE, não da
-- abertura: uma pessoa mexendo sem parar segura o menu aberto indefinidamente sem
-- que nada esteja quebrado. A margem existe para não chamar de defeito o cliente
-- que está fazendo exatamente o que a vitrine pede.

do $$
declare
  corpo text;
  de text;
  para text;
  pares text[][] := array[
    ['d.kiosk_locked,',
     'd.kiosk_locked,
            d.idle_return_seconds,'],
    ['base.kiosk_locked,',
     'base.kiosk_locked,
            base.idle_return_seconds,'],
    ['comh.mode_since < (now() - ''00:15:00''::interval)',
     'comh.mode_since < (now() - GREATEST(''00:15:00''::interval, make_interval(secs => (COALESCE(comh.idle_return_seconds, 30) * 3)::double precision)))']
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
