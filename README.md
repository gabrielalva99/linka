# LINKA

Plataforma de gestão, conteúdo e analytics para dispositivos de demonstração no varejo
físico. Substitui o Product.Me na frota de demonstração da Motorola.

**Em produção desde 18/08/2026**, com frota real em loja. Não é protótipo: mudança
publicada aqui aparece em aparelho de cliente em minutos.

## Monorepo

```
linka/
├── apps/
│   ├── admin/          # Painel web (Next.js, App Router, TS, Tailwind) → painel.linkaretail.com.br
│   ├── agent/          # Agente Android (Kotlin, device owner/kiosk) → roda nos aparelhos
│   ├── site/           # Site institucional (Next.js) → linkaretail.com.br
│   └── studio/         # Material de demonstração e capturas do painel
├── packages/
│   ├── shared/         # Contratos compartilhados (zod), papéis, status
│   └── ui/             # Tokens da marca LINKA
├── supabase/
│   ├── migrations/     # Único caminho para mudar o banco
│   └── functions/      # Edge Functions (agente, convites, alertas)
├── tools/
│   ├── provisionar/    # Provisionamento por cabo (Windows, .bat + PowerShell)
│   ├── auditar-box/    # Audita um TV box em 30 s antes de comprar
│   └── campanha-pais/  # Publicação de campanha sazonal
└── docs/               # Documentação técnica deste repositório
```

A documentação de **produto** (PRD, arquitetura, contrato de dados, planejamento,
backlog) vive fora daqui, na pasta do projeto no OneDrive. Ver [`docs/README.md`](docs/README.md).

## Requisitos

- Node.js 24 (ver `.nvmrc`)
- pnpm 11.17+
- Para o agente: Android Studio, JDK 17 e `adb` no PATH

## Comandos

```bash
pnpm install         # instala o workspace inteiro
pnpm dev             # sobe o painel em desenvolvimento
pnpm build           # build de produção do painel
pnpm typecheck       # checagem de tipos em todos os pacotes
pnpm lint            # lint em todos os pacotes
```

## Regras que não se quebram

Cada uma destas custou um incidente. Não são preferências de estilo.

**Banco só muda por migration.** Nunca alterar schema pelo painel do Supabase nem por
SQL avulso. O arquivo em `supabase/migrations/` é a única versão da verdade, e sem ele
o próximo ambiente nasce diferente deste. Atenção: `supabase db push` **não funciona
neste repositório** e aborta sem aplicar nada. Como aplicar está em
[`supabase/README.md`](supabase/README.md).

**Edge Function só se publica pelo CLI:**

```bash
pnpm exec supabase functions deploy <nome> --project-ref xkzktmsqtvpkxmzftars --use-api
```

Publicar as funções `agent-*` por qualquer outro caminho religa a exigência de JWT e a
frota inteira passa a levar 401. O que impede isso é o `verify_jwt = false` em
[`supabase/config.toml`](supabase/config.toml), que só o CLI lê. Nunca usar `--prune`.

**Nunca rodar `supabase config push`.** Ele reescreve a configuração de autenticação e
devolve a URL do site para `localhost`, derrubando o login em produção.

**Painel lê rollup, nunca `device_events` cru.** A tabela de eventos é particionada e
cresce sem teto; consulta direta nela numa tela que se recarrega sozinha derruba o banco.

**Antes de dar entrega por concluída**, ela precisa ter funcionado em aparelho real. Teste
local não vale como prova neste projeto.

## Variáveis de ambiente

Copie `apps/admin/.env.example` para `apps/admin/.env.local` e preencha. Segredos de
produção (chave do Resend, conta de serviço do Firebase, senhas de guarda das funções)
não moram em variável de ambiente: ficam no **cofre do Supabase**, lidos por
`public.ler_segredo(nome)`. Ver [`supabase/README.md`](supabase/README.md).

## Documentação deste repositório

| Documento | Para quê |
|---|---|
| [`docs/README.md`](docs/README.md) | Mapa da documentação, incluindo a que vive no OneDrive |
| [`docs/SETUP.md`](docs/SETUP.md) | Levantar o ambiente de desenvolvimento do zero |
| [`docs/RUNBOOK-CAMPO.md`](docs/RUNBOOK-CAMPO.md) | O que fazer quando um aparelho da loja dá problema |
| [`apps/agent/README.md`](apps/agent/README.md) | O agente Android: o que faz, como compilar, como instalar |
| [`supabase/README.md`](supabase/README.md) | Banco, migrations, funções, relógios e cofre |
| [`tools/auditar-box/README.md`](tools/auditar-box/README.md) | Reprovar um TV box ruim antes de comprar |
