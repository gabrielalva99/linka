-- Campanha por MODELO: "todos os Razr 60 Ultra", em vez de um a um.
--
-- PEDIDO DO GABRIEL (19/08), montando uma campanha para os Razr 60 Ultra: o
-- alvo mais fino era "Aparelho", e ele so aceita UM. Para cobrir cinco Razr
-- eram cinco campanhas iguais, e cada troca de video depois viraria cinco
-- edicoes — com a chance de esquecer uma e deixar uma vitrine fora do ar.
--
-- Faz sentido justamente neste produto: o conteudo e feito por formato de tela,
-- e formato e caracteristica do MODELO. "Peca do Razr" e uma frase que existe
-- na operacao; ate agora o sistema nao sabia dizer isso.
--
-- Esta migration so cria o tipo e a coluna. A funcao que resolve o conteudo vem
-- na proxima, porque o Postgres nao deixa usar um valor de enum na mesma
-- transacao em que ele e criado.
alter type campaign_scope add value if not exists 'model';

alter table public.campaign_targets
  add column if not exists model_id uuid references public.device_models(id) on delete cascade;

create index if not exists campaign_targets_model_idx
  on public.campaign_targets (model_id) where model_id is not null;
