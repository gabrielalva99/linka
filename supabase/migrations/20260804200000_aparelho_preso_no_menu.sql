-- LINKA — aparelho preso no menu de recursos deixa de passar despercebido.
--
-- O BURACO. O painel de recursos existe para o cliente experimentar o aparelho, e
-- enquanto ele está aberto a campanha NÃO está na tela. Isso é normal por alguns
-- segundos. Preso, é uma vitrine que parou de vender e ninguém acusa: o aparelho
-- continua "no ar", com bateria boa, travas certas e batendo de minuto em minuto.
-- Verde no painel, parado na loja. Com 250 na rua, some.
--
-- Aconteceu hoje mesmo, no aparelho de teste, e só apareceu porque eu estava
-- olhando o banco por outro motivo.
--
-- POR QUE AGORA. Até hoje o retorno automático do painel tinha três defeitos, e um
-- aparelho preso era esperado. Consertados, ficar preso passou a significar que
-- alguma coisa quebrou — e é exatamente aí que um alerta vale, porque deixou de
-- competir com barulho conhecido.
--
-- POR QUE GATILHO, E NÃO A EDGE FUNCTION. O modo é escrito pela batida hoje, mas
-- pode ser escrito por outra coisa amanhã. No gatilho, quem quer que mude o modo
-- carimba a hora — e não existe caminho que esqueça. Também evita republicar a
-- agent-heartbeat, que é a operação com mais chance de derrubar a frota.

-- 1) Desde quando o aparelho está no modo em que está.
alter table public.devices
  add column if not exists mode_since timestamptz;

comment on column public.devices.mode_since is
  'Quando o aparelho entrou no modo atual. Carimbado por gatilho: sem isso não dá para dizer "preso", só "está".';

create or replace function public.carimba_troca_de_modo()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  -- `is distinct from` e não `<>`: com nulo dos dois lados o `<>` devolve nulo, o
  -- if não entra, e o primeiro modo de um aparelho novo nunca ganharia hora.
  if new.mode is distinct from old.mode then
    new.mode_since := now();
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_carimba_troca_de_modo on public.devices;
create trigger trg_carimba_troca_de_modo
  before update on public.devices
  for each row
  execute function public.carimba_troca_de_modo();

-- Frota que já existe nunca trocou de modo sob o gatilho: sem isto, mode_since
-- fica nulo e o aviso nunca dispara para quem já está na rua. Parte-se do último
-- contato, que é o mais perto da verdade que dá para afirmar hoje.
update public.devices
set mode_since = coalesce(last_seen_at, now())
where mode_since is null;

-- 2) O aviso.
do $$
declare
  corpo text;
  de text;
  para text;
  pares text[][] := array[
    ['d.kiosk_locked,',
     'd.kiosk_locked,
            d.mode,
            d.mode_since,'],
    ['base.kiosk_locked,',
     'base.kiosk_locked,
            base.mode,
            base.mode_since,'],
    -- Entra ao lado de "tela sem vídeo", que é o problema irmão: lá a vitrine
    -- está vazia, aqui ela está coberta pelo menu. Os dois significam a mesma
    -- coisa para a loja — a campanha não está na tela.
    -- A âncora é o ÚLTIMO ramo da lista, e ele mudou hoje: até a migration da
    -- manutenção o fim era "sem loja". A primeira tentativa abortou por isso —
    -- que é o motivo de a checagem existir. Um replace que não acha nada passa
    -- calado e deixa o defeito de pé.
    ['as proteções voltam sozinhas ao fim''::text))',
     'as proteções voltam sozinhas ao fim''::text), (comh.mode = ''main_menu''::public.device_mode AND comh.mode_since < (now() - ''00:15:00''::interval),''menu_parado''::text,
                CASE
                    WHEN comh.aberta THEN ''critico''::text
                    ELSE ''atencao''::text
                END,''parado no menu de testes; a campanha não está na tela''::text))']
  ];
  i int;
begin
  corpo := pg_get_viewdef('public.v_device_issues'::regclass, true);

  for i in 1 .. array_length(pares, 1) loop
    de := pares[i][1];
    para := pares[i][2];
    if position(de in corpo) = 0 then
      raise exception
        'ancora nao encontrada em v_device_issues: %. A view mudou — confira antes de remendar.', de;
    end if;
    corpo := replace(corpo, de, para);
  end loop;

  execute 'create or replace view public.v_device_issues with (security_invoker = on) as ' || corpo;
end $$;

-- QUINZE MINUTOS, e não dois. O painel volta sozinho à vitrine em 30 segundos sem
-- toque (configurável por aparelho). Quinze minutos é tempo demais para qualquer
-- cliente de loja e curto o bastante para alguém agir no mesmo turno. Apertar
-- mais faria o cliente demorado virar alarme — e alarme que erra ensina a
-- ignorar a tela, que é o defeito que este aviso existe para não ter.
