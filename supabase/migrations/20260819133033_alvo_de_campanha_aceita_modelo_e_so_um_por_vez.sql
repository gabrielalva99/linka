-- A regra de forma do alvo passa a conhecer 'model'.
--
-- Sem isto, salvar campanha por modelo seria recusado pelo banco: nenhum ramo
-- da regra antiga casa com scope='model', entao o insert estouraria — e a UI
-- nova nao teria como funcionar.
--
-- Cada ramo agora exige o SEU id e proibe os outros, model_id inclusive. Alvo
-- que aponta para duas coisas ao mesmo tempo e ambiguidade guardada em disco:
-- alguem escolheria por ele mais tarde, e ninguem saberia quem.
alter table public.campaign_targets drop constraint if exists campaign_target_shape;

alter table public.campaign_targets add constraint campaign_target_shape check (
  (scope = 'tenant' and chain_id is null and store_id is null and device_id is null and model_id is null)
  or (scope = 'chain'  and chain_id  is not null and store_id is null and device_id is null and model_id is null)
  or (scope = 'store'  and store_id  is not null and chain_id is null and device_id is null and model_id is null)
  or (scope = 'model'  and model_id  is not null and chain_id is null and store_id  is null and device_id is null)
  or (scope = 'device' and device_id is not null and chain_id is null and store_id  is null and model_id is null)
);
