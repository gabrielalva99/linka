# LINKA — Painel

Painel web do LINKA, em Next.js (App Router). É por onde se opera a frota: cadastrar
aparelhos, publicar campanha, acompanhar alertas e ler relatório.

**No ar em https://painel.linkaretail.com.br**, publicado pela Vercel a cada push na
`main`.

## Rodar

```bash
pnpm dev          # a partir da raiz do monorepo, http://localhost:3000
pnpm typecheck
```

Configuração em `.env.local` (copiar de `.env.example`). Ver
[`../../docs/SETUP.md`](../../docs/SETUP.md).

## Como ele conversa com o banco

**Sem service role key.** O painel fala com o Supabase como o usuário logado, e é a RLS
que decide o que aparece. Tela que só funciona com service key é sinal de política
faltando, não de chave faltando.

**Todo acesso passa pelo escopo do cliente.** As consultas usam o auxiliar de tenant em
`lib/tenant.ts` (`porCliente`), que aplica o filtro do cliente selecionado. Consulta que
escapa disso mistura dado de marca com marca, que é o pior defeito possível neste produto.

**Relatório lê rollup, nunca `device_events` cru.** A tela de visão geral se recarrega
sozinha; consulta pesada ali roda a cada minuto por aba aberta.

## Onde ficam as coisas

```
app/(app)/
├── page.tsx            # Visão geral: alertas, produção do dia, pendências
├── dispositivos/       # Frota, ficha do aparelho, modelos, versões publicadas
├── campanhas/          # Campanhas e alvos (rede, loja, modelo, aparelho)
├── biblioteca/         # Criativos, com variação por formato de tela
├── redes/ lojas/       # Rede varejista e pontos de venda
├── clientes/ usuarios/ # Marcas atendidas e quem tem acesso
└── relatorios/         # Leitura dos rollups
```

Texto de tela vive em `messages/pt-BR.json`, nunca escrito direto no componente.

## Como escrever texto de tela

**O painel fala com o cliente.** Simples, sem jargão, e sem revelar decisão de projeto
nem história interna. "Sem contato há 17 min" serve; "heartbeat timeout" não.

**Nada de travessão no meio de frase.** Lê como texto de máquina.

**Cor sai de token**, em `packages/ui`. Não hardcodar `#00f24f` em componente.
