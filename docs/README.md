# Documentação — LINKA

A documentação está dividida em dois lugares, e a divisão é de propósito.

## Aqui, no repositório: como o sistema funciona e como operá-lo

| Documento | Para quê |
|---|---|
| [`SETUP.md`](SETUP.md) | Levantar o ambiente de desenvolvimento do zero |
| [`RUNBOOK-CAMPO.md`](RUNBOOK-CAMPO.md) | O que fazer quando um aparelho da loja dá problema |
| [`../README.md`](../README.md) | Mapa do monorepo e as regras que não se quebram |
| [`../apps/agent/README.md`](../apps/agent/README.md) | O agente Android: o que faz, como compilar, armadilhas |
| [`../supabase/README.md`](../supabase/README.md) | Banco, migrations, funções, relógios e cofre |
| [`../tools/auditar-box/README.md`](../tools/auditar-box/README.md) | Reprovar um TV box ruim antes de comprar |

Estes acompanham o código e envelhecem junto com ele. Mudou o comportamento, muda o
documento no mesmo commit.

## No OneDrive: o que estamos construindo e por quê

A documentação de **produto e planejamento** é a fonte de verdade do projeto e vive na
pasta do projeto, junto do material de identidade visual e do BI:

`.../Matriz projetos/Novo - Product me/`

| Documento | Conteúdo |
|---|---|
| `PLANO.md` | Resumo executivo e roadmap |
| `PRD.md` | Requisitos, módulos, releases, riscos e questões em aberto |
| `docs/ARQUITETURA.md` | Decisões técnicas (ADRs), modelo de dados, fluxos |
| `docs/CONTRATO-DE-DADOS.md` | Catálogo de métricas que a telemetria tem que sustentar |
| `docs/PLANEJAMENTO.md` | Fases com gates, cronograma, custos, governança |
| `docs/BACKLOG.md` | Épicos e histórias com prioridade e fase |
| `docs/REFERENCIA-PRODUCT-ME.md` | O incumbente e o mercado |
| `CLAUDE.md` | Contexto do projeto para sessões de IA |

**Decisão técnica tomada dentro deste repositório vira ADR em `ARQUITETURA.md`.** Se ela
só existe no código e no commit, ela se perde: daqui a seis meses alguém reabre a
discussão sem saber que ela já foi tida, e sem saber o que a fechou.

**Ideia nova entra no `BACKLOG.md`, nunca na fase corrente.**

## Um risco conhecido

Os documentos de produto **não têm cópia fora do OneDrive**. O código tem GitHub, com
histórico e possibilidade de comparar versões; o PRD, a arquitetura e o backlog existem
numa pasta só. Trazer esses arquivos para o repositório resolveria, e ainda não foi feito.
