-- Qual campanha esta no ar em cada aparelho, para a LISTA de dispositivos.
--
-- PEDIDO DO GABRIEL (19/08): "queria nessa tela tambem ter visibilidade da
-- campanha ativa em cada aparelho, sem precisar clicar nele". Com 13 aparelhos
-- ja e incomodo abrir um por um; com 250 e inviavel, e e justamente a pergunta
-- que a operacao faz primeiro ao olhar a frota.
--
-- REUSA `resolve_device_content` em vez de reescrever a regra. A prioridade
-- (aparelho > modelo > loja > rede > cliente), a janela de datas e o horario da
-- loja vivem la; copiar tudo aqui criaria duas verdades que divergem no dia em
-- que alguem mexer numa so — o defeito que este projeto ja pagou com a lista de
-- comandos do heartbeat e com o nome dos apps.
--
-- Custo medido antes de escrever: 0,9 ms por aparelho, 13 ms para a frota de
-- teste. Em 250 aparelhos da uns 220 ms numa tela que ja faz varias consultas.
-- Se um dia pesar, o conserto e materializar — nao duplicar a regra.
create or replace view public.v_campanha_do_aparelho as
select d.id            as device_id,
       d.tenant_id     as tenant_id,
       r.out_campaign_name as campanha,
       r.out_source        as origem
from public.devices d
cross join lateral public.resolve_device_content(d.id) r;

-- resolve_device_content e invoker, entao o RLS de devices e campaigns continua
-- valendo dentro dela: esta view nao pode virar porta para ver campanha de outro
-- cliente.
alter view public.v_campanha_do_aparelho set (security_invoker = on);
