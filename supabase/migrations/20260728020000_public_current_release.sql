-- O kit de provisionamento roda na loja, num notebook sem login no painel, e
-- precisa saber qual versão instalar. Sem isto ele cai no APK do pendrive e
-- provisiona aparelho velho: aconteceu num aparelho de teste, que entrou na
-- 0.15.0 com a frota já na 0.19.0.
--
-- Só a versão ATUAL fica visível sem login, e só o que já é público de qualquer
-- forma: o arquivo no bucket de releases já é aberto (o aparelho baixa a
-- atualização sem sessão). O histórico continua exigindo login.
create policy releases_select_current on public.agent_releases
  for select to anon
  using (is_current);
