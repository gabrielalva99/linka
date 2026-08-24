# Setup — levantar o ambiente do zero

Para quem vai mexer no código. A nuvem já está montada e no ar desde julho de 2026: não
há nada para criar, só para conectar.

## 1. Painel e site

```bash
git clone git@github.com:gabrielalva99/linka.git
cd linka
pnpm install
cp apps/admin/.env.example apps/admin/.env.local
```

Preencha o `.env.local` com os valores de **Project Settings → API** no Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=https://xkzktmsqtvpkxmzftars.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
```

Só isso. O painel **não usa service role key**: ele fala com o banco como o usuário
logado e é a RLS que decide o que ele enxerga.

```bash
pnpm dev          # painel em http://localhost:3000
pnpm typecheck    # antes de commitar
```

Publicação é automática: `git push` na `main` sobe painel e site pela Vercel.

## 2. Banco

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref xkzktmsqtvpkxmzftars
```

Depois disso, leia [`../supabase/README.md`](../supabase/README.md) **antes de aplicar
qualquer coisa**. Este banco atende frota real em loja, e há três comandos que derrubam
produção sem dar erro nenhum na hora.

## 3. Agente Android

Precisa de Android Studio, JDK 17 e `adb` no PATH.

```bash
cd apps/agent
./gradlew assembleRelease
adb install -r linka-agente.apk
```

Para provisionar um aparelho novo (dono do aparelho + travas), use o roteiro em
[`../tools/provisionar/`](../tools/provisionar/). Fazer na mão erra a ordem, e a ordem
importa: instalar o app **antes** de travar, senão o aparelho fica protegido rodando uma
versão velha.

## 4. Acesso ao painel de produção

**https://painel.linkaretail.com.br**

Superadmin: `suporte@linkaretail.com.br`. Usuário novo entra por convite, em
**Clientes → o cliente → Usuários**.

## O que você precisa saber antes do primeiro commit

Estão em [`../README.md`](../README.md), na seção "Regras que não se quebram". Cada uma
custou um incidente em produção. Vale os dois minutos de leitura antes, e não depois.
