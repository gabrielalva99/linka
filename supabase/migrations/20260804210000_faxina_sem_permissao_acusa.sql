-- LINKA — faxina que não apaga nada para de passar em silêncio.
--
-- O CASO REAL, hoje. Recuperei um aparelho pelo cabo com `dpm set-device-owner`,
-- sem restauração de fábrica — e funcionou: painel verde, protegido, no ar,
-- tocando campanha. O que eu não sabia é que o cargo de dono NÃO traz junto o
-- acesso a arquivos: `MANAGE_EXTERNAL_STORAGE` é permissão especial, fora do que
-- o aparelho concede a si mesmo, e precisa de um `appops set` pelo cabo.
--
-- Resultado: a faxina noturna rodou, limpou os dados dos apps, e não apagou
-- NENHUMA foto. Só apareceu porque o Gabriel abriu a ficha do aparelho e leu o
-- texto da última faxina. Em 250 aparelhos ninguém lê 250 textos.
--
-- É o pior tipo de defeito que existe neste produto: silencioso, e com custo que
-- não é técnico. Foto de cliente acumulando num aparelho de vitrine é privacidade
-- de terceiro guardada por engano, e é o que a faxina existe para não deixar
-- acontecer.
--
-- ACOPLAMENTO ASSUMIDO. O aviso casa com o começo do texto que o agente escreve
-- ("SEM PERMISSÃO"). É feio, e é a escolha certa: a alternativa era uma coluna
-- nova, uma versão nova do app e a frota inteira atualizando para ganhar um
-- booleano que este texto já carrega. O comentário correspondente está em
-- Cleanup.kt, para quem for mudar a frase saber que o painel depende dela.

do $$
declare
  corpo text;
  de text;
  para text;
  pares text[][] := array[
    ['d.kiosk_locked,',
     'd.kiosk_locked,
            d.last_cleanup_result,'],
    ['base.kiosk_locked,',
     'base.kiosk_locked,
            base.last_cleanup_result,'],
    ['parado no menu de testes; a campanha não está na tela''::text))',
     'parado no menu de testes; a campanha não está na tela''::text), (COALESCE(comh.last_cleanup_result, ''''::text) LIKE ''SEM PERMISSÃO%'',''faxina_sem_permissao''::text,''atencao''::text,''a faxina não apaga as fotos do cliente; falta liberar o acesso a arquivos pelo cabo''::text))']
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

-- ATENÇÃO, e não crítico. A vitrine continua vendendo com a faxina quebrada: o
-- prejuízo é acumular foto de cliente, e isso se resolve na próxima ida à loja,
-- não correndo agora. Marcar como crítico competiria com aparelho apagado no
-- meio do expediente, que é dinheiro parado no mesmo minuto.
