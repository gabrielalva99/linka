-- Desde quando o aparelho está fora do carregador.
--
-- POR QUE ISTO PRECISA SER GUARDADO. O painel só sabe o estado do instante
-- ("está carregando?"), e com isso não dá para separar duas situações opostas:
-- um cliente com o aparelho na mão por três minutos, que é o trabalho da
-- vitrine acontecendo, e um aparelho esquecido fora da base há seis horas, que
-- é o próximo aparelho a morrer. Alertar sem essa distinção transforma toda
-- demonstração em alarme, e alarme que não fecha ensina a equipe a ignorar a
-- tela inteira.
--
-- O CASO REAL. Casas Bahia Interlagos, 19/08: faltou energia à noite. Os doze
-- aparelhos que estavam na base só perderam a rede e voltaram sozinhos quando a
-- luz voltou. O Moto G06 estava fora do carregador, descarregou no escuro e não
-- voltou — precisou de alguém apertar o botão de ligar no dia seguinte. O
-- aviso de bateria baixa nunca disparou: ele calou com 86%, porque quem caiu
-- primeiro foi o Wi-Fi da loja, não a bateria dele.
alter table public.devices
  add column if not exists fora_da_tomada_desde timestamptz;

comment on column public.devices.fora_da_tomada_desde is
  'Quando o aparelho saiu do carregador. Nulo enquanto estiver carregando.';

create or replace function public.carimba_saida_da_tomada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Voltou para a base: o relógio zera.
  if new.battery_charging is true then
    new.fora_da_tomada_desde := null;
  -- Saiu agora: carimba. Se já estava fora, o carimbo original é preservado —
  -- é ele que diz o TAMANHO da ausência, e reescrever a cada batida do
  -- aparelho deixaria o valor eternamente "agora".
  elsif new.battery_charging is false and old.fora_da_tomada_desde is null then
    new.fora_da_tomada_desde := now();
  end if;
  -- battery_charging nulo (aparelho que ainda não reportou) não mexe em nada.
  return new;
end;
$$;

drop trigger if exists trg_carimba_saida_da_tomada on public.devices;
create trigger trg_carimba_saida_da_tomada
  before update on public.devices
  for each row execute function public.carimba_saida_da_tomada();

-- Semente para quem JÁ está fora da base: sem isto, um aparelho que saiu do
-- carregador ontem só começaria a contar na próxima vez que saísse, e o alerta
-- nasceria cego justamente para os casos que já existem hoje. O último contato
-- é a estimativa honesta disponível — nunca superestima o tempo fora.
update public.devices
   set fora_da_tomada_desde = least(last_seen_at, now())
 where battery_charging is false
   and fora_da_tomada_desde is null
   and last_seen_at is not null;
