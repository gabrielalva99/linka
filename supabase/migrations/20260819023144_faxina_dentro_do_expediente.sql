-- A faxina nasce dentro do horário em que a loja tem energia.
--
-- O QUE ACONTECEU EM CAMPO (Casas Bahia Interlagos, 18/08). A loja fecha às
-- 22:00 e a equipe corta a energia da mesa ao fim do expediente. O padrão da
-- faxina era 23:00, fixo, sem olhar para a loja. A regra no aparelho é "já
-- passou do horário de hoje e ainda não limpei hoje?" — e às 23:00 o aparelho
-- está desligado. De manhã, às 9h, "9h já passou das 23h?" é falso.
--
-- Resultado: a faxina não atrasava, ela NUNCA acontecia. Em nenhum dos 13
-- aparelhos, em nenhum dia. E falhava calada: nada no painel, nada no relatório.
-- O que se acumula são as fotos e vídeos que o cliente tira no aparelho de
-- demonstração — dado de terceiro parado numa vitrine.
--
-- POR QUE UM GATILHO E NÃO UM VALOR PADRÃO MELHOR. Não existe hora boa fixa:
-- shopping que fecha às 22:00 e rua que fecha às 18:00 precisam de horas
-- diferentes. O que vale para as duas é "antes de a loja apagar as luzes".
--
-- Só corrige o que está fora do expediente. Horário deliberado que caiba dentro
-- do dia da loja é respeitado — isto conserta o padrão, não a escolha de quem
-- configurou.
create or replace function private.faxina_dentro_do_expediente()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_abre  time;
  v_fecha time;
begin
  if new.store_id is null or new.cleanup_time is null then
    return new;
  end if;

  select opens_at, closes_at into v_abre, v_fecha
  from public.stores where id = new.store_id;

  if v_fecha is null or v_abre is null then
    return new;
  end if;

  -- Loja que vira o dia (abre 18:00, fecha 02:00) não tem "fora do expediente"
  -- calculável desta forma simples; nesse caso não mexe.
  if v_fecha <= v_abre then
    return new;
  end if;

  if new.cleanup_time < v_abre or new.cleanup_time > v_fecha then
    -- Meia hora antes de fechar: pega o movimento do dia inteiro e ainda sobra
    -- folga para a faxina terminar antes de alguém desligar a tomada.
    new.cleanup_time := v_fecha - interval '30 minutes';
  end if;

  return new;
end;
$$;

drop trigger if exists devices_faxina_no_expediente on public.devices;
create trigger devices_faxina_no_expediente
  before insert or update of store_id on public.devices
  for each row execute function private.faxina_dentro_do_expediente();
