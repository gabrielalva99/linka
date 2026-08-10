-- O QUE ACONTECEU QUANDO O APP MORREU.
--
-- Até aqui, app que trava em loja era invisível: o painel dizia "fora do ar" e
-- ninguém sabia se era energia, rede, aparelho recolhido ou defeito nosso. Com
-- 250 aparelhos, descobrir isso custa uma viagem — ou uma noite adivinhando pelo
-- banco, que foi exatamente como passamos a de 09/08.
--
-- Registro PRÓPRIO, e não um serviço de fora. Três razões, na ordem em que
-- pesam: o erro precisa aparecer na FICHA DO APARELHO, que é onde a operação já
-- olha (num serviço à parte, alguém teria de correlacionar); o procurement da
-- marca vai perguntar o que sai do aparelho, e "nada, fica no seu banco em São
-- Paulo" é resposta melhor que um SDK de terceiro; e a escala alvo é 10 mil
-- aparelhos, não um milhão — o que dispensa a maquinaria que justifica um
-- serviço dedicado.
create table if not exists device_errors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  device_id uuid not null references devices(id) on delete cascade,

  -- Identidade do defeito, calculada no aparelho: tipo da exceção + a primeira
  -- linha do nosso código na pilha. É o que permite dizer "este mesmo erro
  -- aconteceu 40 vezes em 12 aparelhos" em vez de listar 40 ocorrências iguais.
  fingerprint text not null,
  tipo text not null,
  mensagem text,
  pilha text,

  agent_version text,
  os_version text,
  -- Quando o app morreu, pelo relógio do aparelho. Separado de created_at porque
  -- o envio acontece na execução SEGUINTE — às vezes horas depois, se o aparelho
  -- ficou sem rede.
  ocorreu_em timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists device_errors_device_idx on device_errors (device_id, ocorreu_em desc);
create index if not exists device_errors_tenant_idx on device_errors (tenant_id, ocorreu_em desc);
create index if not exists device_errors_fp_idx on device_errors (tenant_id, fingerprint, ocorreu_em desc);

alter table device_errors enable row level security;

-- Leitura segue o mesmo isolamento de todo o resto: quem enxerga o cliente
-- enxerga os erros dele.
drop policy if exists device_errors_select on device_errors;
create policy device_errors_select on device_errors
  for select using (private.has_tenant_access(tenant_id));

-- NINGUÉM ESCREVE PELO PAINEL. Quem relata é o aparelho, pela edge function, com
-- service role. Sem política de insert/update/delete, a tabela é somente-leitura
-- para qualquer sessão de usuário — inclusive superadmin.
--
-- Isso é de propósito: um registro de defeito que uma pessoa pode criar ou apagar
-- deixa de servir como prova de que o aparelho quebrou. É a mesma razão da trilha
-- de auditoria não aceitar ação inventada.

comment on table device_errors is
  'Quedas do aplicativo relatadas pelo próprio aparelho. Somente leitura pelo painel: só a edge function escreve.';
