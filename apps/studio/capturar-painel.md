# Como recapturar as telas do painel

As imagens em `public/painel/` são o painel **de verdade**, em produção, com
uma rede de demonstração de nomes neutros que é criada, fotografada e apagada.

Refaça quando o painel mudar de layout — senão a peça vende uma tela que não
existe mais.

## Por que não é print do ambiente do Gabriel

Porque lá a rede se chama "Teste", a loja tem nome de teste e os aparelhos são
os do laboratório. Não é questão de estética: **dado de cliente não entra em
peça de venda**, e dado de teste denuncia que ainda não há operação.

E não é UI desenhada porque ilustração do produto não prova que o produto
existe — que era exatamente o problema da primeira versão desta peça.

## Ordem, e as três armadilhas

**1. Criar a rede de demonstração.** Um `tenant` novo com slug `demonstracao`,
uma rede varejista, 4 lojas (Centro, Norte, Sul, Leste), 3 bancadas cada, 12
aparelhos. Os mesmos nomes que aparecem no site.

> **Armadilha 1 — o usuário criado por SQL não loga.** O GoTrue quebra quando
> `confirmation_token`, `recovery_token`, `email_change` e
> `email_change_token_new` ficam em `NULL`. Ele responde "e-mail ou senha
> inválidos", que não tem nada a ver com a senha. Grave `''` nessas colunas.

**2. Deixar a frota apresentável.** Todos com `playing_url` preenchido, senão o
painel marca "tela sem vídeo" em todos e a imagem vira um mural de alarme.
Deixe **dois** fora do ar: alerta zerado não mostra o valor do produto, e alerta
em tudo mostra um produto que não funciona.

> **Armadilha 2 — `last_seen_at` envelhece enquanto você trabalha.** A
> tolerância da rede é de 180 s. Se você semear os dados e capturar vinte
> minutos depois, a frota inteira aparece "fora do ar". **Reescreva o
> `last_seen_at` imediatamente antes de capturar.**

**3. Semear sete dias de movimento.** Visitas por hora com curva de loja (fraca
de manhã, pico às 18h) e toques por recurso.

> **Armadilha 3 — número redondo demais entrega o jogo.** Na primeira tentativa
> "Tela" e "Câmera" empataram em 1610,0 exatos. Empate perfeito grita dado
> gerado, e a peça perde justamente a credibilidade que ela foi buscar no
> painel de verdade. Desempate com ruído.

**4. Capturar em 1760×990.** É 16:9 exato e é o tamanho da composição. Em
2400 px de largura o painel vira uma coluna estreita no meio de um vazio,
porque o conteúdo tem largura máxima.

**5. Apagar tudo.** Filtrando por `tenant_id` da rede Demonstração — nada fora
dela pode ser tocado. Confira depois que o banco voltou ao que era: 1 rede
(Teste), 8 aparelhos, 1 loja, 3 usuários. Os contadores de evento e rollup
sobem um pouco: é o aparelho real do Gabriel reportando, e é justamente a prova
de que o dado de verdade não foi tocado.

## As telas, e o que cada uma responde

| arquivo | tela | responde |
| --- | --- | --- |
| `visao.png` | Visão geral | O aparelho está ligado? |
| `frota.png` | Dispositivos | Está com a campanha certa? |
| `testar.png` | Relatórios · o que o visitante quis testar | Qual recurso o cliente mais procura? |
| `hora.png` | Relatórios · movimento por hora | idem, no tempo |
| `relatorio.png` | Relatórios · topo | reserva, não usada na peça |

## A linha que não se cruza

Interface real com dado de exemplo: sim, é prática normal de produto.
**Número de resultado: não.** Nada de percentual de conversão, nada de "cresceu
X". Esse é o número que a marca cobra na reunião seguinte, e ele não existe.
