-- O aparelho passa a contar quanta memória está usando.
--
-- POR QUE. O aplicativo morreu por falta de memória três vezes (moto g17 em
-- 20/08, razr 60 ultra em 21/08 às 08:39 e às 14:16) e nenhuma deu para
-- diagnosticar: o aparelho não media a si mesmo, então não existia curva.
--
-- O caso do razr mostra por que a curva importa mais que o instante: ele rodou
-- 5h16 sem parar entre uma queda e a outra. Se a memória subiu reto, em degraus
-- ou de uma vez no fim aponta culpados diferentes.
--
-- Tentei medir na bancada e não deu: o único aparelho no cabo era o tablet, que
-- tem tela pequena, campanha leve e ficou 38 minutos travado em 42 MB de 192.
-- Quem cai é o razr, que toca vídeo com 3,3 vezes mais pixels e está na loja. A
-- medição precisa vir de lá.
--
-- O TETO VAI JUNTO, e não é detalhe: o Android dá a cada aplicativo uma cota
-- própria, independente da RAM da máquina. O razr morreu com o aparelho tendo
-- memória de sobra, porque quem acabou foi a cota dele. "180 MB" não diz nada
-- sozinho; diz tudo ao lado de "de 192".
alter table public.devices
  add column if not exists heap_usado_mb integer,
  add column if not exists heap_teto_mb integer,
  add column if not exists heap_nativo_mb integer;

comment on column public.devices.heap_usado_mb is 'Memória que o aplicativo está usando agora, em MB.';
comment on column public.devices.heap_teto_mb is 'Cota de memória que o Android dá a este aplicativo, em MB. Não é a RAM do aparelho.';
comment on column public.devices.heap_nativo_mb is 'Memória fora do heap Java (decodificador de vídeo), em MB.';

-- A CURVA, em faixas de 10 minutos.
--
-- Guardar toda batida seriam 360 mil linhas por dia com 250 aparelhos, para
-- responder uma pergunta que uma amostra a cada 10 minutos já responde: são 30
-- pontos nas cinco horas que o razr leva para estourar.
--
-- Guarda o PICO da faixa, e não a média: quem mata é o pico.
create table if not exists public.device_memoria (
  device_id uuid not null references public.devices(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  faixa timestamptz not null,
  heap_usado_mb integer not null,
  heap_teto_mb integer not null,
  heap_nativo_mb integer not null,
  primary key (device_id, faixa)
);

comment on table public.device_memoria is
  'Pico de memória do aplicativo por faixa de 10 minutos. Existe para diagnosticar a morte por falta de memória.';

create index if not exists device_memoria_faixa on public.device_memoria (faixa desc);

alter table public.device_memoria enable row level security;

create policy memoria_select on public.device_memoria
  for select using (private.has_tenant_access(tenant_id));
