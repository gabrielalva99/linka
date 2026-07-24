# Setup — ações do Gabriel para destravar o resto do R0

O código da fundação está pronto e no GitHub (`gabrielalva99/linka`, privado).
Faltam **duas ações que só você pode fazer** (criar recursos na nuvem). Depois delas,
eu aplico as migrations, ligo a autenticação e coloco o painel no ar.

## 1. Criar o projeto Supabase dedicado  ⏱️ ~5 min

Passo a passo completo em [`../supabase/README.md`](../supabase/README.md). Resumo:

1. https://supabase.com/dashboard → **New project**
2. Name `linka-prod` · **Region: South America (São Paulo)** · senha forte (guardar)
3. Quando criar, me avise para eu **reconectar o MCP do Supabase** a este projeto
   (ou me passe URL + chaves de `Project Settings → API`).

> Importante: **projeto novo**, separado do que já existe (o do site de apresentações).
> Não misturar os dois bancos.

## 2. Conectar o repositório na Vercel (CI/CD)  ⏱️ ~5 min

1. https://vercel.com/new → importar o repositório `gabrielalva99/linka`
2. **Root Directory**: `apps/admin`  (a Vercel detecta Next.js e pnpm automaticamente)
3. Em **Environment Variables**, adicionar (valores do Supabase do passo 1):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy. A partir daí, todo `git push` na branch `main` publica sozinho.

## Depois das duas ações, eu faço (sem você):

- Aplicar as 5 migrations no banco e rodar o verificador de segurança do Supabase.
- Criar seu usuário como **superadmin**.
- Construir login com papéis + convite por e-mail (Resend).
- Cadastrar o tenant **Motorola** e telas de redes/lojas/posições.
- Confirmar o painel no ar, conectado ao banco.
