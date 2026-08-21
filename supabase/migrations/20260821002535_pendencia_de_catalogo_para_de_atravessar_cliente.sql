-- O aviso de "pacote sem classificação" apitava na tela do cliente ERRADO.
--
-- O CASO REAL (20/08). Um pacote sem classificação apareceu no cliente Teste. O
-- aviso acendeu também na tela da Motorola; o Gabriel clicou e não havia nada —
-- porque a tela de destino (/dispositivos/aplicativos) FILTRA por cliente. Ao
-- trocar para o cliente Teste, o mesmo clique levou ao lugar certo.
--
-- A CAUSA. Esta função conta o banco inteiro: ela junta `devices` e nunca usa a
-- junção para filtrar nada. Quem opera a plataforma enxerga todos os clientes,
-- então o número somava as marcas todas.
--
-- POR QUE ISSO É MAIS QUE UM INCÔMODO. É a mesma classe de "auditoria não
-- atravessa cliente" e "conteúdo não atravessa cliente", já consertadas em
-- 30/07: uma tela de marca não pode reagir ao dado de outra marca. Aqui o
-- vazamento é só de contagem, mas o efeito prático é pior do que parece — um
-- aviso que não fecha ao ser clicado ensina a equipe a ignorar o bloco inteiro,
-- que é exatamente o que o resumo do dia existe para evitar.
--
-- O parâmetro é opcional e nulo mantém o comportamento antigo (contar tudo), que
-- é o certo para quem olha a plataforma sem escolher marca.
create or replace function public.pacotes_sem_classificacao(p_tenant uuid default null)
returns integer
language sql
stable
set search_path to 'public'
as $function$
  select count(distinct e.package)::int
  from public.device_events e
  join public.devices d on d.id = e.device_id
  left join public.app_catalog c on c.package = e.package
  where e.kind = 'app_usage'
    and c.package is null
    and (p_tenant is null or d.tenant_id = p_tenant);
$function$;

comment on function public.pacotes_sem_classificacao(uuid) is
  'Pacotes medidos que ainda não têm nome no catálogo. Com cliente informado, conta só o dele.';
