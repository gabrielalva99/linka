-- LINKA — push: o servidor chama o aparelho, em vez de o aparelho ficar perguntando.
--
-- ONDE ISTO ENTRA. O aparelho ja parou de perguntar por conteudo (o heartbeat
-- carrega a novidade). O que sobrou periodico e o proprio heartbeat, de 60 em 60
-- segundos, e ele responde por ~1,0 das ~1,1 chamadas/min que restaram. Ele nao
-- pode simplesmente ficar lento: e por ele que comando chega ao aparelho, e
-- "reiniciar a vitrine" levar 5 minutos e inaceitavel numa loja com gente parada
-- esperando. O push resolve essa ordem: com ele entregando comando na hora, o
-- heartbeat pode ficar lento sem ninguem sentir.
--
-- POR QUE GATILHO NO BANCO, e nao chamada no painel. Hoje existem QUATRO lugares
-- no painel que enfileiram comando (comando avulso, desinstalar app, inventario,
-- tentar atualizar de novo). Pendurar o envio em cada um e garantir que o quinto,
-- escrito daqui a um mes, nao avise ninguem — e o sintoma seria "esse comando
-- demora e os outros nao", que ninguem liga a causa. No gatilho, qualquer escritor
-- e pego: painel, Edge Function, SQL na mao.
--
-- A GUARDA. `agent-push` nao pode ser aberta: quem chama manda a frota inteira
-- falar com o servidor. A chave de verificacao nasce aqui dentro
-- (gen_random_uuid) e vai direto para o cofre — nunca passa por arquivo, log ou
-- conversa. Os dois lados leem do mesmo lugar.

create extension if not exists pg_net;

-- O endereco do aparelho no FCM. Vem pelo heartbeat, como o stable_id: os
-- aparelhos que ja estao na rua nunca vao reprovisionar, e e assim que eles
-- aprendem.
alter table public.devices
  add column if not exists push_token text,
  add column if not exists push_token_at timestamptz;

comment on column public.devices.push_token is
  'Endereco do aparelho no FCM. Nulo = so responde no ritmo do heartbeat.';

-- Segredo compartilhado entre o gatilho e a funcao. Gerado no banco de proposito.
select public.guardar_segredo('push_guarda', gen_random_uuid()::text)
where public.ler_segredo('push_guarda') is null;

create or replace function private.acordar_aparelho()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  -- So quando entra comando NOVO. Sem isto, toda batida que confirma execucao
  -- (pending_command -> null) dispararia um push inutil para 250 aparelhos.
  if new.pending_command is null or new.pending_command is not distinct from old.pending_command then
    return new;
  end if;
  if new.push_token is null then
    return new;  -- aparelho antigo: continua chegando pelo heartbeat de 60s
  end if;

  -- Assincrono: o painel nao pode ficar esperando o Google responder para dizer
  -- que o comando foi enfileirado. Se o push falhar, o heartbeat entrega do mesmo
  -- jeito — o push e atalho, nunca o unico caminho.
  perform net.http_post(
    url := 'https://xkzktmsqtvpkxmzftars.supabase.co/functions/v1/agent-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-linka-guarda', public.ler_segredo('push_guarda')
    ),
    body := jsonb_build_object('device_id', new.id, 'motivo', 'comando')
  );
  return new;
end;
$function$;

drop trigger if exists devices_acordar_no_comando on public.devices;
create trigger devices_acordar_no_comando
  after update of pending_command on public.devices
  for each row execute function private.acordar_aparelho();

comment on function private.acordar_aparelho() is
  'Avisa o aparelho por push quando entra comando novo. Gatilho, e nao chamada no painel, para nenhum escritor futuro escapar. Ver migration 20260731030000.';
