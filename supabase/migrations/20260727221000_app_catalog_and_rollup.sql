-- LINKA — de pacote técnico para linguagem de negócio.
-- "com.motorola.camera5" não diz nada para quem lê relatório na Motorola, e o
-- mesmo recurso muda de nome entre modelos (camera5 no Razr, camera3 em outros):
-- sem normalizar, o mesmo teste apareceria como dois recursos diferentes.
-- Fica no SERVIDOR de propósito: classificar um app novo é uma linha no banco,
-- não uma atualização em 250 aparelhos.
create table public.app_catalog (
  package text primary key,
  label text not null,
  category text,
  is_noise boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.app_catalog is 'Pacote → nome de negócio. is_noise sai dos relatórios (fica no dado cru para auditoria).';

alter table public.app_catalog enable row level security;
create policy catalog_select on public.app_catalog
  for select using (auth.uid() is not null);
create policy catalog_write on public.app_catalog
  for all using (private.is_superadmin()) with check (private.is_superadmin());

insert into public.app_catalog (package, label, category, is_noise) values
  ('com.motorola.camera5',                    'Câmera',        'camera',  false),
  ('com.motorola.camera3',                    'Câmera',        'camera',  false),
  ('com.motorola.camera2',                    'Câmera',        'camera',  false),
  ('com.android.chrome',                      'Navegador',     'browser', false),
  ('com.google.android.youtube',              'YouTube',       'video',   false),
  ('com.google.android.apps.photos',          'Fotos',         'gallery', false),
  ('com.motorola.gallery',                    'Fotos',         'gallery', false),
  ('com.google.android.apps.messaging',       'Mensagens',     'social',  false),
  ('com.google.android.googlequicksearchbox', 'Busca Google',  'search',  false),
  ('com.android.settings',                    'Ajustes',       'system',  false),
  ('com.android.vending',                     'Play Store',    'system',  false),
  -- ruído: tela do sistema, não escolha do cliente
  ('com.google.android.permissioncontroller', 'Permissões',    'system',  true),
  ('com.android.permissioncontroller',        'Permissões',    'system',  true),
  ('com.android.systemui',                    'Sistema',       'system',  true),
  ('com.motorola.launcher3',                  'Tela inicial',  'system',  true),
  ('com.motorola.mobiledesktop',              'Interno',       'system',  true)
on conflict (package) do nothing;

/**
 * Jornada do cliente por hora, no formato que o BI consome (CONTRATO-DE-DADOS):
 * aparelho × hora × recurso, com sessões e tempo. Sai só o que é escolha do
 * cliente — ruído de sistema fica no dado cru.
 *
 * É uma VIEW porque hoje a frota é pequena e dado sempre fresco vale mais que
 * desempenho. Quando o volume crescer, vira tabela materializada com o mesmo
 * contrato — quem consome não muda (ADR-4).
 */
create view public.v_interaction_hourly as
select
  e.tenant_id,
  e.device_id,
  date_trunc('hour', e.started_at) as hora,
  coalesce(c.label, e.package)     as recurso,
  c.category                       as categoria,
  count(*)                         as sessoes,
  sum(e.duration_seconds)          as segundos
from public.device_events e
left join public.app_catalog c on c.package = e.package
where e.kind = 'app_usage'
  and coalesce(c.is_noise, false) = false
group by 1, 2, 3, 4, 5;
