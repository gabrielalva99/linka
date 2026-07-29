-- LINKA — travar a força bruta na porta de entrada da frota.
--
-- Achado no pentest: a entrada do aparelho é um oráculo. Código errado devolve
-- 404, código certo devolve o token do aparelho — e ninguém contava tentativa.
-- O código do aparelho tem 8 dígitos hexadecimais e o espaço é compartilhado
-- por toda a plataforma: com 250 aparelhos cadastrados, um laço simples acerta
-- um em dias. E um token vale para mandar telemetria e para receber conteúdo.
--
-- Não dá para exigir login aqui: quem chama é aparelho, numa loja, antes de
-- existir na frota. O que dá é contar quem erra.
create table public.provision_attempts (
  id         bigserial primary key,
  ip         text not null,
  ok         boolean not null,
  created_at timestamptz not null default now()
);

comment on table public.provision_attempts is 'Tentativas de entrada na frota, para frear quem chuta código. Só a função de provisionamento escreve.';

create index provision_attempts_ip_time
  on public.provision_attempts (ip, created_at desc);

-- RLS ligado e NENHUMA política: ninguém do painel lê nem escreve. Quem grava é
-- a função de provisionamento, que roda com a chave de serviço e passa por
-- cima do RLS. Tabela de segurança que o próprio produto consegue ler é meio
-- caminho para virar tabela de reconhecimento.
alter table public.provision_attempts enable row level security;

-- Registro de segurança não é histórico: passou de uma semana, não serve para
-- frear ninguém e só ocupa espaço.
select cron.schedule(
  'linka-limpa-tentativas',
  '17 4 * * *',
  $$delete from public.provision_attempts where created_at < now() - interval '7 days'$$
);
