# LINKA

Plataforma de gestão, conteúdo e analytics para dispositivos de demonstração no varejo.
Substitui o Product.Me na frota de smartphones de demonstração (cliente inicial: Motorola).

## Monorepo

```
linka/
├── apps/
│   └── admin/          # Painel web (Next.js 16, App Router, TS, Tailwind 4)
├── packages/
│   ├── shared/         # Tipos e contratos compartilhados (papéis, status de device…)
│   └── ui/             # Design system — tokens da marca LINKA
├── supabase/           # Migrations e Edge Functions (a partir do R0)
└── docs/               # Ponteiro para a documentação de produto
```

> Documentação de produto (PRD, arquitetura, contrato de dados, planejamento, backlog)
> vive na pasta do projeto no OneDrive — ver `docs/README.md`.

## Requisitos

- Node.js ≥ 20 (recomendado 24 — ver `.nvmrc`)
- pnpm 11+

## Comandos

```bash
pnpm install         # instala todo o workspace
pnpm dev             # sobe o painel (apps/admin) em modo desenvolvimento
pnpm build           # build de produção do painel
pnpm typecheck       # checagem de tipos em todos os pacotes
pnpm lint            # lint em todos os pacotes
```

## Variáveis de ambiente

Copie `apps/admin/.env.example` para `apps/admin/.env.local` e preencha (ver o arquivo de exemplo).

## Status

**R0 — Fundação** em construção. Sem frota real conectada ainda.
