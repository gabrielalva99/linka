# CLAUDE.md — apps/studio (peças de vídeo da LINKA)

Projeto **Remotion**: vídeo renderizado a partir de React. Componente entra,
arquivo de vídeo sai. Documentação: https://www.remotion.dev/docs/

## Licença — decidido em 05/08, não reabrir

O texto da licença (`LICENSE.md` do remotion, conferido cru): uso gratuito para
**pessoa física**, ONG, empresa com **até 3 funcionários**, ou quem está
avaliando sem uso comercial. Acima disso, licença de empresa.

Detalhes que valem se o assunto voltar:
- Quem paga é **a entidade dona do projeto**, não quem escreveu o código.
- Terceiro que opera o mesmo projeto (freelancer, estúdio) **soma no total**.
- Faixa que caberia aqui: **Creators, US$ 25/mês por assento** (baixo volume,
  para a própria empresa). Não a de Automators, que é para produto que
  renderiza no lugar do usuário.

**Decisão do Gabriel: uso como criação própria, sob a licença gratuita.**
Risco conhecido, custo de saída conhecido (US$ 25/mês). Não levantar de novo a
cada peça — se a situação mudar, ele reabre.

## Onde esta pasta se encaixa

Isto **não é a plataforma**. A LINKA é produto: o painel e o agente Android
respondem sozinhos. Esta pasta é a fábrica de peça visual, o braço criativo.
Nada aqui pode virar dependência de runtime de `apps/admin` ou `apps/agent`.

O que sai daqui é **arquivo pronto** (mp4, webm, jpg), commitado no destino.
Ninguém renderiza vídeo em produção.

## Marca

Os tokens são os mesmos do painel e do site, em `packages/ui/src/tokens.css`.
Aqui eles estão duplicados em `src/marca.ts` **de propósito**: Remotion não usa
Tailwind e precisa dos valores em JS. Mudou lá, muda aqui.

    fundo #0a0b0a · superfície #121513 · linha #262b27
    texto #f7f9f8 · texto fraco #8a938c · verde #00f24f

Fonte: New Black Typeface, em `public/fonts/`, carregada com `loadFont` do
`@remotion/fonts` em `src/marca.ts`. Sem isso o vídeo sai numa fonte de sistema
qualquer — e como o resultado é um arquivo e não uma tela que alguém está
olhando, ninguém percebe até estar no ar.

### Logotipo — nunca escrever "LINKA" com a fonte

O logotipo é `src/painel/LinkaLogo.tsx`, vetor tirado de
`branding/Logotipo/Linka_Logo_v2.ai`. **Escrever LINKA com a fonte da marca não
é a marca:** o desenho tem espacejamento e formas próprias, e a repartição de
cor é **LIN em verde-claro `#d9f9e3` + KA em verde `#00f24f`** — não branco e
verde. Já foi ao ar errado num vídeo por causa disso.

O mesmo vale para qualquer marca de terceiro: **nenhum logo de cliente entra
numa peça** sem contrato assinado e autorização por escrito.

## Regras do Remotion (as que quebram silenciosamente)

Componente de Remotion **não é** componente de React interativo. Ele é
renderizado quadro a quadro, e o mesmo quadro tem que dar sempre o mesmo pixel.

- **Nada de `Math.random()`.** Use `random('semente')` do próprio Remotion.
  Com `Math.random()` cada quadro sorteia de novo e o vídeo treme.
- **Nada de `useState`, `useEffect`, `onClick`.** Não existe interação, não
  existe tempo passando: existe `useCurrentFrame()`.
- **Toda animação sai do frame**, via `interpolate()` ou `spring()`.
- Em `interpolate()`, sempre `extrapolateLeft: 'clamp'` e
  `extrapolateRight: 'clamp'`, senão o valor escapa fora do intervalo.
- `<AbsoluteFill>` para empilhar camadas, `<Sequence>` para atrasar, `<Series>`
  para enfileirar, `<TransitionSeries>` quando precisar de transição.
- Vídeo é `<OffthreadVideo>`, imagem é `<Img>`, áudio é `<Audio>`. Arquivo do
  `public/` se referencia com `staticFile()`.
- `useVideoConfig()` para largura, altura, fps e duração. Nunca fixe no braço.

Dentro de uma `<Sequence>`, `useCurrentFrame()` recomeça do 0.

## Composições

Definidas em `src/Root.tsx`. Padrão: 30 fps.

| id            | uso                                    | tamanho   |
| ------------- | -------------------------------------- | --------- |
| `banner-topo` | topo de linkaretail.com.br, em laço     | 1920×720  |

## Renderização — NÃO economizar pixel em peça de interface

Interface é o pior caso do H.264: texto fino, fios de 1 px e **verde sobre
preto**. O H.264 comprime a cor em 4:2:0 — joga fora três quartos da
informação de cor — e a peça inteira é cor sobre preto. Some a isso o
reescalonamento no navegador e o resultado é tudo borrado.

Medido nesta peça de 30 s:

| receita | tamanho | resultado |
| --- | --- | --- |
| 1440×810, crf 27 | 1,61 MB | borrado, foi reprovado |
| 1920×1080, crf 18 | 2,63 MB | ok |
| **2400×1350, crf 20** | **2,72 MB** | **nítido — é a receita** |

A conta que eu errei: economizar 1,1 MB custou a nitidez inteira. Painel
escuro e parado comprime muito bem, então **renderize acima da resolução de
exibição** (2400 de largura cobre um bloco de ~1150 px em tela retina) e deixe
o `crf` em 20.

    remotion render <id> out/x.mp4 --codec=h264 --crf=20 --scale=1.25

O `--scale` tem que dar dimensão inteira: 1,25 serve (2400×1350), 1,334 não
(2561,28 — a renderização morre no fim, depois de gastar o tempo todo).

## Como rodar

Numa máquina nova, primeiro traga as skills do Remotion — elas não estão no
repositório (2,9 MB de documentação de terceiro), só o `skills-lock.json` com
origem e hash de cada uma:

    npx skills add remotion-dev/skills

Depois:

    pnpm --filter @linka/studio studio     # editor visual, localhost:3000
    pnpm --filter @linka/studio banner     # renderiza o mp4
    pnpm --filter @linka/studio banner:webm
    pnpm --filter @linka/studio banner:poster

A primeira renderização baixa o Chrome Headless Shell (uns 150 MB). É uma vez só.

## Honestidade da peça

Vale a mesma regra do site: **não inventar número.** Se aparecer algo com cara
de tela do painel, o dado é ilustrativo e a peça tem que deixar isso claro.
Gráfico bonito com métrica falsa é o tipo de coisa que uma marca cobra em
reunião, e a conta chega junto com a renovação.
