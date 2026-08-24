-- O painel para de guardar segredo: alerta critico vira e-mail.
--
-- 71 alertas criticos em 7 dias, ZERO avisos enviados. A coluna notified_at
-- existe desde julho e nada nunca escreveu nela: o aviso foi previsto e nunca
-- construido.
--
-- O custo apareceu em 22/08: os aparelhos 009 e 012 sairam do ar as 17h50 de
-- sabado e voltaram as 11h de segunda. 41 horas. O painel abriu alerta critico
-- nos dois no minuto certo e ficou olhando para a propria tela. Quem descobriu
-- foi o vendedor, ao chegar na loja.
--
-- ── POR QUE ISTO NAO VIVE DENTRO DO sync_device_alerts ──────────────────────
-- Detectar e avisar sao trabalhos com riscos diferentes. Se o envio de e-mail
-- falhar (Resend fora, chave trocada, cota estourada) e ele estiver no mesmo
-- caminho da deteccao, a frota inteira para de ser vigiada por causa de um
-- e-mail. Ficam separados: o cron de 5 minutos continua sincronizando, e um
-- segundo cron varre o que ficou sem aviso.
--
-- O efeito colateral bom e que o aviso vira auto-curavel: enquanto notified_at
-- for nulo, a proxima passagem tenta de novo. Uma hora de Resend fora nao perde
-- alerta nenhum, so atrasa.

-- Senha de guarda propria, no mesmo cofre do push. A funcao e chamada pelo cron
-- sem usuario logado, entao o que separa o cron de qualquer um na internet e
-- este cabecalho.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'alertas_guarda') then
    perform public.guardar_segredo('alertas_guarda', encode(gen_random_bytes(32), 'hex'));
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- QUEM PRECISA SABER
--
-- O time que opera, nao o cliente. Hoje a Motorola so tem gente da agencia
-- dentro, entao da na mesma; no dia em que a marca tiver login proprio, receber
-- "seu aparelho esta apagado" antes da agencia poder agir seria pessimo.
create or replace function public.destinatarios_de_alerta(p_tenant uuid)
returns table(email text)
language sql
security definer
set search_path to 'public'
as $$
  select distinct p.email
  from public.profiles p
  where p.email is not null
    and (
      p.is_superadmin
      or exists (
        select 1 from public.memberships m
        where m.user_id = p.id and m.tenant_id = p_tenant and m.role = 'agency'
      )
    );
$$;

comment on function public.destinatarios_de_alerta(uuid) is
  'Quem recebe aviso de alerta critico deste cliente: superadmin mais os papeis de agencia. Cliente final fica de fora de proposito.';

-- ────────────────────────────────────────────────────────────────────────────
-- O QUE AINDA NAO FOI AVISADO
--
-- ── A GRAVIDADE E LIDA AGORA, NAO NA HORA EM QUE ABRIU ─────────────────────
-- device_alerts grava a gravidade uma vez, na insercao, e nunca mais mexe. Isso
-- criaria um buraco exato do tamanho de uma noite: aparelho que morre as 22h30
-- abre como "atencao" (loja fechada), continua morto as 10h da manha e nunca
-- viraria "critico", porque a linha ja estava escrita. Ninguem seria avisado do
-- aparelho apagado o dia inteiro.
--
-- Por isso a consulta volta em v_device_issues e pergunta a gravidade DE AGORA.
-- A view ja sabe o horario de cada loja; nao ha regra de horario duplicada aqui.
create or replace function public.alertas_pendentes_de_aviso()
returns table(
  alert_id uuid,
  tenant_id uuid,
  cliente text,
  fase text,
  code text,
  device_name text,
  loja text,
  kind text,
  detalhe text,
  desde timestamptz
)
language sql
security definer
set search_path to 'public'
as $$
  -- ABRIU: aberto, sem aviso, e critico NESTE momento.
  select a.id, a.tenant_id, t.name, 'abriu'::text,
         d.code, d.name, coalesce(s.name, 'sem loja'),
         a.kind, i.detalhe, a.opened_at
  from public.device_alerts a
  join public.devices d on d.id = a.device_id
  join public.tenants t on t.id = a.tenant_id
  left join public.stores s on s.id = d.store_id
  join public.v_device_issues i
    on i.device_id = a.device_id and i.tipo = a.kind
  where a.closed_at is null
    and a.notified_at is null
    and i.gravidade = 'critico'

  union all

  -- FECHOU: so avisa o fim de quem teve o comeco avisado. Sem esta condicao, um
  -- alerta que abriu de madrugada como "atencao" e fechou de manha mandaria um
  -- "resolvido" sozinho, sobre um problema que ninguem soube que existiu.
  select a.id, a.tenant_id, t.name, 'fechou'::text,
         d.code, d.name, coalesce(s.name, 'sem loja'),
         a.kind, a.detail, a.opened_at
  from public.device_alerts a
  join public.devices d on d.id = a.device_id
  join public.tenants t on t.id = a.tenant_id
  left join public.stores s on s.id = d.store_id
  where a.closed_at is not null
    and a.notified_at is not null
    and a.closed_notified_at is null;
$$;

comment on function public.alertas_pendentes_de_aviso() is
  'Alertas que ainda nao viraram e-mail. Le a gravidade de agora em v_device_issues, e nao a gravada na abertura, para que aparelho que morre de madrugada seja avisado quando a loja abre.';

-- ────────────────────────────────────────────────────────────────────────────
-- CARIMBA O QUE FOI ENVIADO
--
-- Chamada DEPOIS de o Resend confirmar. Carimbar antes seria trocar "avisei" por
-- "tentei avisar", e o alerta nunca mais voltaria na fila.
create or replace function public.marcar_alertas_avisados(p_ids uuid[], p_fase text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n integer;
begin
  if p_fase = 'abriu' then
    update public.device_alerts set notified_at = now()
    where id = any(p_ids) and notified_at is null;
  elsif p_fase = 'fechou' then
    update public.device_alerts set closed_notified_at = now()
    where id = any(p_ids) and closed_notified_at is null;
  else
    raise exception 'fase desconhecida: %', p_fase;
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.marcar_alertas_avisados(uuid[], text) is
  'Carimba os alertas que ja viraram e-mail. Chamar so depois da confirmacao do Resend.';

revoke all on function public.destinatarios_de_alerta(uuid) from public, anon, authenticated;
revoke all on function public.alertas_pendentes_de_aviso() from public, anon, authenticated;
revoke all on function public.marcar_alertas_avisados(uuid[], text) from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- O RELOGIO
--
-- Roda um minuto depois do de sincronizacao (que esta em */5) para trabalhar em
-- cima do resultado dele, e nao na mesma batida.
select cron.schedule(
  'linka-alertas-avisar',
  '1-56/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://xkzktmsqtvpkxmzftars.supabase.co/functions/v1/alertas-avisar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-linka-guarda', public.ler_segredo('alertas_guarda')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
