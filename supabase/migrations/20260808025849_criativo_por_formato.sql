-- LINKA — criativo por formato de tela.
--
-- O PROBLEMA, medido em aparelho real em 24/07: um vídeo 1080x2400 encaixa
-- perfeito no Edge 30 Ultra, corta ~9% na tela interna do Razr 60 Ultra
-- (1224x2992) e corta 47% na tela EXTERNA dele (1080x1272, quase quadrada).
-- Enquadramento não recupera meia tela perdida — dobrável exposto fechado na
-- loja precisa de arquivo próprio.
--
-- Em 07/08 chegou o primeiro pack real da agência: 14 arquivos da MESMA peça,
-- um por resolução, incluindo exatamente 1080x1272 e 1224x2992. Quem já produz
-- certo é a agência; quem não sabe escolher é a plataforma.
--
-- O DESENHO. A variante mora na própria mídia (`variant_of`), e não numa tabela
-- nova de "peça". Assim `campaign_items` não muda: a campanha continua apontando
-- para UM arquivo — o principal — e o servidor troca pela variante que encaixa na
-- tela daquele aparelho. Campanha existente segue funcionando sem migração de
-- dados, e quem nunca cadastrar variante nunca percebe que isso existe.

-- ── Onde a mídia diz o formato dela ─────────────────────────────────────────
--
-- Lido do arquivo no upload, NUNCA do nome. O primeiro pack real já veio
-- inconsistente ("1056 x 1066" com espaços, "1066x1056" sem) — parser de nome
-- erraria no arquivo mais importante, que é o do formato incomum.
alter table media_assets
  add column if not exists width  integer,
  add column if not exists height integer,
  add column if not exists variant_of uuid references media_assets(id) on delete cascade;

alter table media_assets
  drop constraint if exists media_assets_dimensoes_positivas;
alter table media_assets
  add constraint media_assets_dimensoes_positivas
    check ((width is null or width > 0) and (height is null or height > 0));

-- Buscar as variantes de uma peça acontece a cada montagem de conteúdo, por
-- aparelho. Sem índice isso é varredura na biblioteca inteira.
create index if not exists media_assets_variant_of_idx
  on media_assets (variant_of) where variant_of is not null;

comment on column media_assets.variant_of is
  'Quando preenchido, este arquivo é a versão desta mesma peça para outro formato de tela. A campanha aponta para a principal (variant_of nulo) e o servidor escolhe.';

-- ── Onde o aparelho diz o tamanho da tela ───────────────────────────────────
--
-- DUAS FONTES, de propósito, e a ordem importa.
--
-- `devices.screen_*` é o que o APARELHO reporta, e é a única que acerta o
-- dobrável: a tela do Razr muda quando ele abre. Só existe a partir da versão do
-- agente que reporta isso.
--
-- `device_models.screen_*` é cadastrado à mão e vale para o modelo inteiro. É o
-- que faz a escolha funcionar HOJE, na frota que já está na rua e não vai
-- atualizar por causa disto — e continua valendo depois, como reserva para
-- aparelho que ainda não bateu nenhuma vez.
--
-- Nenhuma das duas é obrigatória: sem tela conhecida, o comportamento é
-- exatamente o de antes desta migration. Formato errado é ruim; vitrine preta
-- porque faltou um cadastro é pior.
alter table device_models
  add column if not exists screen_width  integer,
  add column if not exists screen_height integer;

alter table device_models
  drop constraint if exists device_models_tela_positiva;
alter table device_models
  add constraint device_models_tela_positiva
    check ((screen_width is null or screen_width > 0) and (screen_height is null or screen_height > 0));

alter table devices
  add column if not exists screen_width  integer,
  add column if not exists screen_height integer;

alter table devices
  drop constraint if exists devices_tela_positiva;
alter table devices
  add constraint devices_tela_positiva
    check ((screen_width is null or screen_width > 0) and (screen_height is null or screen_height > 0));

comment on column devices.screen_width is
  'Tela ATUAL reportada pelo aparelho. Em dobrável muda quando abre, por isso vem no heartbeat e não no provisionamento. Tem precedência sobre a resolução do modelo.';

-- ── As duas travas do vínculo de variante ───────────────────────────────────
--
-- Isto não é zelo abstrato. Em 29/07 mediu-se o furo equivalente em campanha: as
-- chaves estrangeiras não obrigavam campanha e vídeo a serem do mesmo cliente, e
-- o RLS só confere o tenant da própria linha — que quem escreve preenche com o
-- dele. Deu para pôr o vídeo de um cliente na campanha de outro. Em produção
-- seria a peça da Motorola na vitrine da Claro.
--
-- `variant_of` é exatamente a mesma forma de vínculo, então nasce com a mesma
-- proteção: gatilho no banco, não confiança na tela.
create or replace function private.valida_variante_de_midia()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_pai    uuid;
begin
  if new.variant_of is null then
    return new;
  end if;

  -- Uma mídia não é variante de si mesma. Sem isto, um UPDATE distraído cria um
  -- ciclo e a escolha no servidor entra em laço.
  if new.variant_of = new.id then
    raise exception 'Uma mídia não pode ser variante de si mesma.';
  end if;

  select tenant_id, variant_of into v_tenant, v_pai
  from media_assets where id = new.variant_of;

  if v_tenant is null then
    raise exception 'A peça principal informada não existe.';
  end if;

  -- Mesmo cliente. Esta é a trava que impede o vídeo de uma marca de entrar,
  -- pela porta da variante, na vitrine de outra.
  if v_tenant <> new.tenant_id then
    raise exception 'A variante e a peça principal precisam ser do mesmo cliente.';
  end if;

  -- UM nível só. Variante de variante criaria uma árvore que o servidor teria de
  -- percorrer a cada aparelho, e nenhum caso real precisa disso: são formatos
  -- irmãos da mesma peça, não uma hierarquia.
  if v_pai is not null then
    raise exception 'Esta mídia já é variante de outra. A variante aponta sempre para a peça principal.';
  end if;

  return new;
end;
$$;

drop trigger if exists media_assets_valida_variante on media_assets;
create trigger media_assets_valida_variante
  before insert or update of variant_of, tenant_id on media_assets
  for each row execute function private.valida_variante_de_midia();

-- ── A peça principal não pode virar variante com filhas penduradas ──────────
--
-- O gatilho acima olha a linha que está sendo escrita. Este olha o outro lado:
-- transformar em variante uma mídia que JÁ é principal de outras criaria o nível
-- 2 pela porta dos fundos, sem passar pela checagem de cima.
create or replace function private.impede_principal_virar_variante()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.variant_of is not null and old.variant_of is null then
    if exists (select 1 from media_assets where variant_of = new.id) then
      raise exception 'Esta peça já tem variantes. Desvincule as variantes antes de torná-la variante de outra.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists media_assets_impede_nivel_2 on media_assets;
create trigger media_assets_impede_nivel_2
  before update of variant_of on media_assets
  for each row execute function private.impede_principal_virar_variante();
