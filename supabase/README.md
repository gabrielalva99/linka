# Supabase — LINKA

Banco, autenticação, storage, funções e relógios do LINKA. **Projeto dedicado**, região
**South America (São Paulo)**, ref `xkzktmsqtvpkxmzftars`. Plano Pro, com backup diário e
7 dias de retenção.

Este banco atende frota real em loja. Não é ambiente de teste.

## Migrations

**O arquivo em `migrations/` é a única versão da verdade.** Nunca alterar schema pelo
painel do Supabase nem por SQL avulso: o que não estiver aqui não existe no próximo
ambiente, e a diferença só aparece quando já é tarde.

São 146 arquivos, em ordem cronológica. Não vale a pena listar aqui, porque a lista
envelhece antes de ser lida. O nome de cada arquivo diz o que ele conserta, e o cabeçalho
de cada um diz **por quê**, com o incidente que o motivou. Essa é a documentação de
verdade do banco.

```bash
pnpm exec supabase db push                        # aplica o que falta
node ../tools/conferir-migrations.mjs             # lista as versões locais
node ../tools/conferir-migrations.mjs versoes.json # compara com o que está no banco
```

Aplicar migration direto no banco e esquecer de versioná-la **não dá erro nenhum**. Tudo
funciona, e a divergência só aparece no dia em que alguém publica a partir do repositório
e o ambiente volta no tempo. Já aconteceu três vezes em dois dias. É para isso que serve
o comparador acima.

## Edge Functions

```bash
pnpm exec supabase functions deploy <nome> --project-ref xkzktmsqtvpkxmzftars --use-api
```

**Este é o único caminho.** Publicar por qualquer outro religa a exigência de JWT, e a
frota inteira passa a levar 401 sem nada no painel acusar. O que segura isso é o
`verify_jwt = false` no [`config.toml`](config.toml), que só o CLI lê. Nunca usar `--prune`.

**Nunca rodar `supabase config push`.** Ele reescreve a configuração de autenticação e
devolve a URL do site para `localhost`, derrubando o login em produção.

| Função | Quem chama | JWT |
|---|---|---|
| `agent-provision` | Aparelho entrando na frota | não |
| `agent-heartbeat` | Aparelho, a cada 60 s | não |
| `agent-content` | Aparelho, buscando campanha e versão | não |
| `agent-events` | Aparelho, enviando uso medido | não |
| `agent-push` | Gatilho do banco, ao entrar comando novo | não (guarda) |
| `alertas-avisar` | Relógio, de 5 em 5 minutos | não (guarda) |
| `invite-user` | Painel | sim |
| `remove-user` | Painel | sim |

As duas chamadas pelo banco não têm JWT para mandar: o que as protege é o cabeçalho
`x-linka-guarda`, cujo valor nasce dentro do banco e mora no cofre.

## Relógios (pg_cron)

| Job | Ritmo | O que faz |
|---|---|---|
| `linka-alertas` | `*/5 * * * *` | Abre e fecha alertas comparando a frota com `v_device_issues` |
| `linka-alertas-avisar` | `1-56/5 * * * *` | Manda por e-mail o que ficou sem aviso |
| `rollup-visita-hora` | `7 * * * *` | Preenche os rollups de hoje e de ontem |
| `linka-limpa-tentativas` | `17 4 * * *` | Descarta tentativas de provisionamento com mais de 7 dias |

Detectar e avisar são jobs separados de propósito. Se o envio de e-mail cair, a
vigilância da frota não pode cair junto.

## Cofre de segredos

Segredo de produção não mora em variável de ambiente nem no repositório. Fica no vault
do Supabase, lido de dentro do banco e das funções:

```sql
select public.ler_segredo('resend_api_key');
select public.guardar_segredo('nome', 'valor');
```

| Segredo | Para quê |
|---|---|
| `resend_api_key` | Enviar e-mail (convite e alerta) |
| `fcm_service_account` | Acordar o aparelho por push |
| `push_guarda` | Senha de guarda da função `agent-push` |
| `alertas_guarda` | Senha de guarda da função `alertas-avisar` |

## Regras do modelo de dados

**Painel lê rollup, nunca `device_events` cru.** A tabela de eventos é particionada e
cresce sem teto. Consulta direta nela numa tela que se recarrega sozinha derruba o banco.
Os rollups são preenchidos por `preencher_rollup_dia(data)`, que é idempotente.

**Todo isolamento entre clientes é por RLS**, com `private.has_tenant_access(tenant_id)`.
Função nova que atravessa cliente é vazamento de dado de marca para marca. Existe uma
varredura em [`../scripts/varredura-rls.sh`](../scripts/varredura-rls.sh).

**Alerta não é apagado, é fechado.** `device_alerts` guarda abertura, aviso e fechamento.
O histórico de quando a loja ficou apagada é justamente o que se quer olhar depois.

## Variáveis de ambiente do painel

Em **Project Settings → API**, para `apps/admin/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xkzktmsqtvpkxmzftars.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
```

O painel **não usa service role key**. Ele fala com o banco como o usuário logado, e é a
RLS que decide o que ele enxerga. Se alguma tela precisar de service key para funcionar,
o furo está na política, não na chave.
