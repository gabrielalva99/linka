-- O lançador da Samsung contava como visita do cliente.
--
-- O CASO (20/08). O tablet Galaxy Tab A7 Lite reportou 1h51 de
-- `com.sec.android.app.launcher` em blocos de uma hora — e isso virou "1 visita,
-- 6653 segundos de uso" no relatório. Aparelho parado com a vitrine no ar
-- aparecendo como cliente usando o aparelho quase duas horas.
--
-- O sistema JÁ resolvia isso: `is_noise` no catálogo tira o pacote das contas, e
-- os lançadores da Motorola (launcher3, cli.settings, secondarydisplay) já
-- estavam marcados desde a varredura de 30/07. O da Samsung nunca apareceu antes
-- porque até hoje a frota era só Motorola.
--
-- Ou seja: não é defeito novo, é o catálogo alcançando a primeira marca nova. E
-- foi o próprio aviso de "pacote sem classificação" que apontou — funcionou como
-- projetado, só apitava na tela do cliente errado (consertado na migration
-- anterior).
--
-- Lançador nunca é visita. Aparelho parado no lançador é vitrine APAGADA, que é
-- problema a resolver, não interação a comemorar.
insert into public.app_catalog (package, label, category, is_noise) values
  ('com.sec.android.app.launcher', 'Tela inicial Samsung', 'Sistema', true),
  ('com.sec.android.app.launcher.activities', 'Tela inicial Samsung', 'Sistema', true),
  ('com.samsung.android.app.aodservice', 'Tela sempre ativa', 'Sistema', true),
  ('com.samsung.android.forest', 'Bem-estar digital', 'Sistema', true),
  -- Esta NÃO é ruído: é a tela de otimização de memória que o nosso botão abre.
  -- O tempo que o cliente passa nela é demonstração de verdade, e é o par do
  -- toque em "Otimização de RAM" no painel de recursos.
  ('com.samsung.android.lool', 'Otimização de RAM', 'Demonstração', false)
on conflict (package) do update
  set label = excluded.label, category = excluded.category, is_noise = excluded.is_noise;
