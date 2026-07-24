# Supabase — LINKA

Banco de dados, autenticação e storage do LINKA. **Projeto dedicado** (não compartilhar
com outros produtos) — decisão registrada em 23/07/2026.

## Criar o projeto dedicado (ação do Gabriel, uma vez)

1. Acesse https://supabase.com/dashboard e clique em **New project**.
2. **Organization**: a sua (ou crie uma "LINKA" para separar cobrança).
3. **Name**: `linka-prod`.
4. **Region**: **South America (São Paulo)** — obrigatório (LGPD / dados no Brasil).
5. **Database password**: gere uma forte e guarde em local seguro.
6. Crie o projeto e aguarde o provisionamento (~2 min).

## Conectar (para eu aplicar as migrations)

Depois de criado, preciso de acesso ao novo projeto. Opção recomendada:

- **Reconectar o MCP do Supabase** a este projeto (trocar o token/ref do projeto na
  configuração do MCP para o `linka-prod`). Assim eu aplico as migrations e valido tudo
  daqui, sem você colar SQL manualmente.

Alternativa sem MCP: você roda a Supabase CLI (`supabase link` + `supabase db push`) ou
cola o conteúdo dos arquivos de `migrations/` no SQL Editor, na ordem numérica.

## Variáveis de ambiente (após criar o projeto)

Em **Project Settings → API**, copie para `apps/admin/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon/publishable key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>   # só server-side, nunca no cliente
```

## Migrations (ordem de aplicação)

| Arquivo | O que cria |
|---|---|
| `20260723130000_extensions.sql` | Extensões (pgcrypto) |
| `20260723130100_tenancy.sql` | Perfis, tenants, memberships, funções de autorização, gatilhos |
| `20260723130200_org_hierarchy.sql` | Redes, lojas (país/fuso), posições |
| `20260723130300_rls_policies.sql` | Políticas RLS (isolamento por tenant) |
| `20260723130400_audit.sql` | Trilha de auditoria |

## Depois de aplicar

- Criar o primeiro **superadmin**: registrar o usuário do Gabriel e marcar
  `is_superadmin = true` na tabela `profiles` (via SQL/serviço).
- Rodar o verificador de segurança do Supabase (advisors) e revisar avisos.
- Cadastrar o tenant `Motorola` e suas redes/lojas.
