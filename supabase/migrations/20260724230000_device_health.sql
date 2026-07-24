-- LINKA — telemetria de saúde do aparelho (paridade com o incumbente, REFERENCIA §12.1).
-- Responde "por que essa loja não está no ar?" sem ninguém ir até a loja.
alter table public.devices
  add column temperature_c numeric(4,1),
  add column uptime_seconds bigint,
  add column screen_on boolean,
  add column connection text,
  add column signal_dbm smallint;

comment on column public.devices.temperature_c is 'Temperatura da bateria em °C — aparelho exposto/fritando na vitrine.';
comment on column public.devices.uptime_seconds is 'Segundos desde o último boot — denuncia aparelho que reinicia sozinho.';
comment on column public.devices.screen_on is 'Tela acesa neste momento: vitrine apagada não aparece como offline.';
comment on column public.devices.connection is 'wifi | cellular | ethernet | none.';
comment on column public.devices.signal_dbm is 'Intensidade do sinal em dBm (negativo; -50 ótimo, -80 ruim).';
