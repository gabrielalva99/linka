-- Quem retirou o aparelho da vitrine para venda.
--
-- POR QUE EXISTE (pedido do Gabriel na visita de 18/08). A loja vende os
-- aparelhos de exposicao, e desmontar uma vitrine era uma acao cara e anonima: o
-- aparelho sumia da frota e nao sobrava rastro de quem fez. "Foi so um teste" e
-- uma resposta barata quando ninguem precisa assinar embaixo.
--
-- O dado e DECLARATORIO, e e honesto dizer isso: ninguem confere identidade na
-- tela do aparelho. O que sustenta o registro e o PIN da loja, que so quem
-- trabalha ali tem, mais a hora exata gravada pelo servidor. Nao e prova
-- judicial; e o suficiente para uma conversa com nome e data.
alter table public.devices
  add column if not exists retirado_em timestamptz,
  add column if not exists retirado_por text,
  add column if not exists retirado_cargo text,
  add column if not exists retirado_loja text;

comment on column public.devices.retirado_em is
  'Quando o aparelho foi retirado da vitrine para venda, pela tela de manutencao.';
comment on column public.devices.retirado_por is
  'Nome declarado por quem retirou. Declaratorio: o que sustenta e o PIN da loja, que so quem trabalha ali tem.';

create index if not exists devices_retirado_em_idx
  on public.devices (tenant_id, retirado_em) where retirado_em is not null;
