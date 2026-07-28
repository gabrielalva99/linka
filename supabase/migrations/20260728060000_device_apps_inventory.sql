-- O que está instalado em cada aparelho, reportado pelo próprio aparelho.
--
-- Sem isto, a única visão que existia era uma lista de nove pacotes escrita à
-- mão dentro do app. Um jogo instalado pelo vendedor ficava invisível, e num
-- modelo novo a câmera podia ter outro nome de pacote e a faxina passava batido
-- dizendo que tinha funcionado.
--
-- Tabela separada de devices porque é lista, não campo: dá para perguntar
-- "quais aparelhos têm este app" sem varrer JSON.
create table public.device_apps (
  device_id uuid not null references public.devices (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  package text not null,
  label text not null,
  version text,
  -- App de fábrica não se desinstala; some da gaveta. A distinção muda o que
  -- o painel pode oferecer, então vem do aparelho e não de um palpite.
  is_system boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (device_id, package)
);

comment on table public.device_apps is 'Apps que o cliente consegue abrir no aparelho. Reportado pelo agente; a faxina limpa esta lista.';

create index device_apps_tenant on public.device_apps (tenant_id, package);

alter table public.device_apps enable row level security;
create policy device_apps_select on public.device_apps
  for select using (private.has_tenant_access(tenant_id));
