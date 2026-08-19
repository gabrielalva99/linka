-- `salvar_campanha` passa a aceitar alvo por modelo.
--
-- Parametro NOVO com valor padrao, e no fim da lista: assim a assinatura antiga
-- continua valendo. Sem o padrao, qualquer chamada que ainda nao passe
-- p_model_id — inclusive o painel em producao entre o deploy do banco e o do
-- front — pararia de achar a funcao e o botao de salvar campanha morreria sem
-- explicacao.
do $$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='salvar_campanha';

  if position('p_device_id uuid)' in def) = 0
     or position('scope, chain_id, store_id, device_id)' in def) = 0 then
    raise exception 'salvar_campanha mudou; revisar antes de trocar';
  end if;

  def := replace(def, 'p_device_id uuid)', 'p_device_id uuid, p_model_id uuid DEFAULT NULL::uuid)');
  def := replace(def,
    'scope, chain_id, store_id, device_id)',
    'scope, chain_id, store_id, device_id, model_id)');
  def := replace(def,
    'case when p_scope = ''device'' then p_device_id end',
    'case when p_scope = ''device'' then p_device_id end,
    case when p_scope = ''model''  then p_model_id  end');

  execute def;
end $$;
