-- O relatorio deixa de mostrar nome de pacote para o cliente.
--
-- O QUE APARECIA (visto pelo Gabriel, 19/08): "com.myos.camera",
-- "pdf.pdfreader.viewer.editor.free", "com.google.android.dialer" no meio de
-- Camera, YouTube e Fotos. Painel falando com o cliente em linguagem de
-- programador.
--
-- E O NOME JA EXISTIA. O inventario do aparelho reporta o rotulo que o proprio
-- Android mostra: com.android.camera2 e "Camera", com.google.android.dialer e
-- "Telefone", pdf.pdfreader... e "Leitor de PDF". O relatorio simplesmente nao
-- olhava para la — caia direto do catalogo curado para o nome do pacote.
--
-- O GANHO MAIOR NAO FOI ESTETICO. O mesmo app aparecia com tres nomes
-- diferentes (Camera, com.myos.camera, com.android.camera2) e cada um contava
-- suas sessoes separado: o recurso mais usado da loja aparecia com 19 aberturas
-- quando tinha 25. Nome tecnico nao e so feio, e numero errado.
--
-- Tres fontes, nesta ordem:
--   1. app_catalog     — decisao nossa, curada, vale sobre tudo
--   2. inventario      — o que o Android chama, e ja esta no banco
--   3. nome do pacote  — ultimo recurso, quando nem o aparelho sabe
--
-- POR QUE UMA FUNCAO e nao tres coalesces iguais: o nome era resolvido em tres
-- lugares (rollup de recurso, rollup de toque, jornada do aparelho). Regra
-- repetida em tres lugares vira buraco no dia em que alguem arruma um so — e
-- este projeto ja pagou por isso com a lista de comandos do heartbeat.
create or replace function public.nome_do_app(p_package text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select c.label from public.app_catalog c
      where c.package = p_package and c.label is not null and c.label <> ''),
    -- O rotulo mais visto na frota. Aparelhos diferentes as vezes chamam o mesmo
    -- pacote de formas distintas (idioma, versao); ganha o mais comum, com
    -- desempate estavel para o relatorio nao mudar de nome entre execucoes.
    (select a.label from public.device_apps a
      where a.package = p_package and a.label is not null and a.label <> ''
        and a.label <> p_package
      group by a.label
      order by count(*) desc, a.label
      limit 1),
    p_package
  );
$$;

do $$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='preencher_rollup_dia';

  if position('coalesce(c.label, e.package)' in def) = 0 then
    raise exception 'preencher_rollup_dia mudou; revisar antes de trocar';
  end if;
  def := replace(def, 'coalesce(c.label, e.package)', 'public.nome_do_app(e.package)');
  execute def;

  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='device_journey';

  if position('c.label' in def) = 0 then
    raise exception 'device_journey mudou; revisar antes de trocar';
  end if;
  def := replace(def, 'coalesce(c.label, e.package)', 'public.nome_do_app(e.package)');
  execute def;
end $$;

-- A tela de Otimizacao de RAM (o botao novo do painel de recursos) mora num
-- pacote sem icone, entao o inventario nao traz rotulo para ela. Como o botao e
-- nosso, o nome tambem e.
insert into public.app_catalog (package, label, category, is_noise)
values ('com.motorola.appforecast', 'Otimização de RAM', 'sistema', false)
on conflict (package) do update set label = excluded.label, category = excluded.category;
