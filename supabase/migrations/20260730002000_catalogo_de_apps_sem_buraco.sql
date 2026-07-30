-- LINKA — pacote desconhecido para de virar "recurso mais usado".
--
-- O QUE APARECEU NA TELA, em 30/07, na ficha do aparelho 113:
--
--   Recurso mais usado:  com.motorola.la…
--
-- Um nome de pacote truncado como indicador principal da tela mais usada do
-- painel. O relatorio, na mesma hora, dizia Camera e YouTube — porque ele usa o
-- catalogo. Duas telas, duas verdades.
--
-- A CAUSA nao era codigo: `device_journey` JA consulta o catalogo e JA filtra
-- ruido. O problema e o DEFAULT quando o pacote nao esta no catalogo:
--
--   coalesce(c.label, e.package)          -> mostra o nome tecnico
--   coalesce(c.is_noise, false) = false   -> conta como recurso do cliente
--
-- Ou seja: **todo pacote que a gente nao conhece entra como recurso testado pelo
-- cliente**, com nome de programador. O culpado do dia era
-- `com.motorola.launcher.secondarydisplay` — o launcher da TELA EXTERNA do Razr,
-- que abre sozinho quando o aparelho e fechado. Nao e alguem testando nada.
-- Junto vinha `com.google.android.setupwizard`, o assistente de configuracao.
--
-- POR QUE ISSO IMPORTA ALEM DA ESTETICA. O numero "recurso mais usado" e o que
-- sustenta a promessa de venda do produto: qual recurso o cliente procura, por
-- modelo e por loja. Se a lista mistura launcher e assistente de configuracao com
-- camera e YouTube, o dado nao orienta sortimento nenhum — e ninguem percebe,
-- porque parece um dado.
--
-- ESTA MIGRATION fecha os buracos conhecidos. O buraco ESTRUTURAL (pacote novo
-- que aparecer amanha continua entrando como recurso) fica no backlog como item
-- proprio: precisa de uma tela que liste pacote nao classificado para alguem
-- decidir. Tratar desconhecido como ruido por padrao seria pior — esconderia um
-- recurso de verdade sem ninguem saber.

insert into public.app_catalog (package, label, category, is_noise) values
  -- Launcher da tela externa do dobravel. Abre sozinho ao fechar o aparelho.
  ('com.motorola.launcher.secondarydisplay', 'Tela externa', 'sistema', true),
  -- Assistente de configuracao do Android, do provisionamento.
  ('com.google.android.setupwizard', 'Configuração inicial', 'sistema', true),
  -- Vistos na frota de teste e igualmente ruido de sistema.
  ('com.motorola.launcher',            'Tela inicial',        'sistema', true),
  ('com.android.systemui',             'Interface do sistema','sistema', true),
  ('com.google.android.apps.nexuslauncher', 'Tela inicial',   'sistema', true),
  ('com.android.intentresolver',       'Escolher app',        'sistema', true),
  ('com.google.android.packageinstaller','Instalador',        'sistema', true),
  ('com.android.packageinstaller',     'Instalador',          'sistema', true),
  ('com.motorola.setup',               'Configuração inicial','sistema', true),
  ('com.motorola.help',                'Ajuda Motorola',      'sistema', true)
on conflict (package) do update
  set label    = excluded.label,
      category = excluded.category,
      is_noise = excluded.is_noise;

comment on table public.app_catalog is
  'Pacote → nome de negócio. is_noise sai dos relatórios (fica no dado cru para auditoria). ATENÇÃO: pacote AUSENTE daqui é contado como recurso do cliente e exibido com o nome técnico — ver migration 20260730002000.';

-- Segunda passada: o que a frota de teste ainda mostrava sem classificacao.
-- Todos sao ruido de sistema (eSIM, restauracao de backup, o proprio "android").
insert into public.app_catalog (package, label, category, is_noise) values
  ('com.google.android.euicc',        'Chip virtual (eSIM)',  'sistema', true),
  ('com.motorola.coresettingsext',    'Ajustes internos',     'sistema', true),
  ('com.google.android.apps.restore', 'Restaurar backup',     'sistema', true),
  ('android',                         'Sistema Android',      'sistema', true)
on conflict (package) do update
  set label = excluded.label, category = excluded.category, is_noise = excluded.is_noise;
