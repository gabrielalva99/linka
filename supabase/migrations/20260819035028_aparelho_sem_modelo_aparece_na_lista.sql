-- Aparelho sem modelo cadastrado passa a aparecer na lista de pendencias.
--
-- POR QUE (achado pelo Gabriel, 19/08). Tres aparelhos da Casas Bahia entraram
-- na frota, funcionaram o dia inteiro e nao tinham modelo: o cadastro tinha
-- "Edge 60", "Moto G86" e "Razr 60", e a loja tem as versoes Pro, 5G e Ultra.
-- O vinculo automatico exige nome igual, e e rigido de proposito — casar
-- "Edge 60" com "Edge 60 Pro" juntaria telas diferentes, e o criativo hoje e
-- escolhido pelo formato da tela.
--
-- O QUE ISSO ESCONDIA. Nao era so uma linha feia no relatorio: os tres viravam
-- "sem modelo", e com eles sumia a LINHA. A cobertura por linha da loja nao
-- mostrava Razr nenhum, porque o unico Razr estava sem modelo. Numa
-- apresentacao para a marca, isso e a plataforma dizendo que a linha nao esta
-- na loja quando esta.
--
-- E falhava calado: nada no painel, nada em alerta. A unica pista era uma linha
-- num relatorio que alguem abriu por acaso.
--
-- Nao acusa quem nunca se conectou: esse aparelho ja aparece como "fora do ar /
-- nunca se conectou", e dois avisos para o mesmo fato treinam a ignorar os dois.
do $$
declare def text;
begin
  select pg_get_viewdef('public.v_device_issues'::regclass, true) into def;

  if position('            d.store_id,' in def) = 0
     or position('            base.store_id,' in def) = 0
     or position(') t(vale, tipo, gravidade, detalhe)' in def) = 0 then
    raise exception 'a estrutura esperada da view mudou; revisar antes de recriar';
  end if;

  def := replace(def, '            d.store_id,', '            d.model_id,' || chr(10) || '            d.store_id,');
  def := replace(def, '            base.store_id,', '            base.model_id,' || chr(10) || '            base.store_id,');
  def := replace(
    def,
    ') t(vale, tipo, gravidade, detalhe)',
    ', (comh.model_id IS NULL AND comh.last_seen_at IS NOT NULL,''sem_modelo''::text,''atencao''::text,'
      || '''sem modelo cadastrado: fica fora dos relatorios por modelo e da cobertura por linha''::text)'
      || ') t(vale, tipo, gravidade, detalhe)'
  );

  execute 'create or replace view public.v_device_issues as ' || def;
end $$;

-- Recriar view apaga esta opcao (ja aconteceu neste projeto), e sem ela a view
-- le com os poderes de quem a criou — ou seja, atravessa cliente.
alter view public.v_device_issues set (security_invoker = on);
