-- LINKA — o painel passa a saber se a vitrine esta REALMENTE presa.
--
-- O DEFEITO. devices.kiosk_locked nunca foi a trava do quiosque. O agente o
-- calcula com hasUserRestriction() sobre uma lista de restricoes de rede
-- (DISALLOW_CONFIG_WIFI e parentes). Isso responde "as travas de rede estao
-- aplicadas", e nao "o aparelho esta presa no app".
--
-- As duas coisas andavam juntas por acidente e se separaram quando a saida de
-- manutencao passou a existir: stopLockTask() solta o aparelho e NAO mexe nas
-- restricoes. Resultado — durante os cinco minutos de manutencao, com o aparelho
-- aberto na mao de alguem dentro da loja, o painel continua dizendo "trancado".
--
-- Dois estragos, e o segundo e o grave:
--
--   1. nao da para ver que um aparelho esta aberto AGORA, que e exatamente o
--      minuto em que alguem quer olhar;
--   2. se o startLockTask() falhar ao voltar (fabricante que recusa; a excecao e
--      engolida de proposito para nao derrubar a vitrine), o painel continua
--      dizendo "trancado" para sempre. Vitrine solta em silencio e o alerta
--      "sem travas" jamais dispara, porque as restricoes de rede estao intactas.
--
-- A CORRECAO. Tres fatos distintos, com nome que corresponde ao que medem:
--
--   kiosk_locked     - as travas de rede estao aplicadas (o que sempre foi)
--   lock_task_on     - o aparelho esta preso no app AGORA (a trava do quiosque)
--   maintenance_open - alguem destravou com PIN e a janela ainda esta correndo
--
-- POR QUE NAO RENOMEEI kiosk_locked. Ele alimenta o alerta "sem travas" da tela
-- inicial e ja tem historico. Trocar o significado de uma coluna em uso muda o
-- que um alerta existente quer dizer, sem ninguem perceber — o mesmo tipo de erro
-- que esta migracao conserta. Coluna nova para fato novo.
--
-- SEM ALERTA AINDA, de proposito. "Fora do quiosque" e legitimo durante a
-- manutencao e por instantes quando a tela reinicia. Um alerta sem limite de
-- duracao piscaria a cada atualizacao do app e ensinaria a ignorar a caixa
-- amarela. Primeiro o painel passa a dizer a verdade; o alarme entra depois, com
-- tempo minimo medido em aparelho real.

alter table public.devices
  add column if not exists lock_task_on boolean,
  add column if not exists maintenance_open boolean not null default false;

comment on column public.devices.kiosk_locked is
  'Travas de REDE aplicadas (Wi-Fi, modo aviao). Nao e a trava do quiosque — ver lock_task_on.';
comment on column public.devices.lock_task_on is
  'O aparelho esta preso no app agora (lock task). Nulo = versao do agente antiga, que nao reporta.';
comment on column public.devices.maintenance_open is
  'Alguem destravou com o PIN e a janela de manutencao ainda esta aberta.';
