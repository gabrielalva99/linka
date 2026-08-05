/**
 * A rede de sinais — a composição do herói.
 *
 * ── O que ela é ───────────────────────────────────────────────────────────
 * Uma constelação em perspectiva: cada nó é um dispositivo numa loja, cada
 * linha é dado chegando. Os pulsos verdes que correm pelas linhas são as
 * visitas subindo para o painel. Um nó está apagado e não pulsa — é o aparelho
 * que ninguém sabia que tinha caído, e é a mesma história da seção 01.
 *
 * ── Por que SVG e CSS, e não Three.js ─────────────────────────────────────
 * A escala do projeto é 10 mil dispositivos, não um estúdio de games. WebGL
 * numa página de vendas custa uns 600 KB de biblioteca, esquenta celular
 * fraco e é a primeira coisa que falha em máquina velha de loja. Em SVG isto
 * é vetor: nítido em qualquer tela, sem dependência, sem raster para borrar.
 *
 * ── Por que a profundidade é falsa, e tudo bem ────────────────────────────
 * Não há projeção 3D de verdade: cada nó carrega um `p` de 0 a 1 (longe a
 * perto) e ele governa raio, brilho, espessura e desfoque ao mesmo tempo. O
 * olho lê isso como profundidade porque é assim que profundidade se parece —
 * e custa zero de processamento.
 *
 * ── Movimento ─────────────────────────────────────────────────────────────
 * Tudo é animação de CSS, sem JavaScript: a página continua sendo renderizada
 * no servidor. Quem pediu menos movimento ao sistema recebe a constelação
 * parada, que continua fazendo sentido — o movimento é tempero, não conteúdo.
 */

/** Nó da rede: posição no quadro e profundidade (0 = fundo, 1 = frente). */
type No = { x: number; y: number; p: number; apagado?: boolean };

/**
 * A constelação é desenhada à mão, não sorteada.
 *
 * Posição aleatória dá aglomerado e buraco; composição é o trabalho. Os nós da
 * frente ficam abaixo e à esquerda, os do fundo sobem para a direita — é o que
 * cria a diagonal que sustenta o bloco ao lado do título.
 */
const NOS: No[] = [
  // fundo
  { x: 322, y: 58, p: 0.16 },
  { x: 470, y: 104, p: 0.2 },
  { x: 566, y: 196, p: 0.12 },
  { x: 168, y: 96, p: 0.18, apagado: true },
  // meio
  { x: 92, y: 214, p: 0.48 },
  { x: 232, y: 172, p: 0.56 },
  { x: 386, y: 198, p: 0.5 },
  { x: 522, y: 272, p: 0.44 },
  // frente
  { x: 158, y: 352, p: 0.88 },
  { x: 318, y: 316, p: 1 },
  { x: 462, y: 382, p: 0.84 },
  { x: 250, y: 462, p: 0.78 },
  { x: 402, y: 492, p: 0.68 },
  { x: 556, y: 430, p: 0.58 },
  { x: 66, y: 404, p: 0.52 },
];

/** Ligações, por índice. Malha esparsa: rede cheia demais vira teia. */
const LIGACOES: [number, number][] = [
  [0, 1], [1, 2], [0, 5], [1, 6], [2, 7], [3, 4], [3, 5],
  [4, 5], [5, 6], [6, 7], [4, 8], [5, 9], [6, 9], [7, 10],
  [8, 9], [9, 10], [8, 11], [9, 11], [10, 12], [11, 12],
  [10, 13], [4, 14], [8, 14], [12, 13],
];

/** As ligações que levam pulso. Poucas: pulso em tudo vira ruído. */
const COM_PULSO = [4, 8, 11, 13, 15, 18, 20];

export function RedeDeSinais() {
  return (
    <div className="relative mx-auto w-full max-w-[560px] justify-self-center">
      {/* Sem brilho de fundo próprio: a seção do herói já tem o dela, e as
          duas empilhadas viram névoa verde. A profundidade aqui vem dos halos
          de cada nó, que respondem à distância — o fundo chapado não. */}

      <svg
        viewBox="0 0 640 560"
        className="relative w-full"
        role="img"
        aria-label="Dispositivos de várias lojas conectados, com dados chegando"
      >
        <defs>
          <radialGradient id="halo">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* as ligações */}
        {LIGACOES.map(([a, b], i) => {
          const na = NOS[a];
          const nb = NOS[b];
          /* A ligação herda a profundidade do nó mais à frente: linha que vem
             da frente é mais grossa e mais clara, e é isso que separa os
             planos sem precisar de projeção de verdade. */
          const p = Math.max(na.p, nb.p);
          const morta = na.apagado || nb.apagado;
          return (
            <line
              key={i}
              x1={na.x}
              y1={na.y}
              x2={nb.x}
              y2={nb.y}
              stroke={morta ? "var(--color-ink-600)" : "var(--color-primary)"}
              strokeWidth={0.5 + p * 1.1}
              strokeOpacity={morta ? 0.5 : 0.1 + p * 0.22}
            />
          );
        })}

        {/* os pulsos: um traço curto correndo pela ligação */}
        {COM_PULSO.map((idx, i) => {
          const [a, b] = LIGACOES[idx];
          const na = NOS[a];
          const nb = NOS[b];
          const comprimento = Math.hypot(nb.x - na.x, nb.y - na.y);
          return (
            <line
              key={`pulso-${idx}`}
              x1={na.x}
              y1={na.y}
              x2={nb.x}
              y2={nb.y}
              stroke="var(--color-primary)"
              strokeWidth={2}
              strokeLinecap="round"
              className="linka-pulso"
              style={{
                strokeDasharray: `18 ${comprimento}`,
                // Cada pulso parte num momento diferente: em uníssono a rede
                // pisca como um semáforo em vez de respirar.
                animationDelay: `${i * 0.9}s`,
                ["--linka-corrida" as string]: `${comprimento + 18}`,
              }}
            />
          );
        })}

        {/* os nós */}
        {NOS.map((n, i) => {
          const r = 2.5 + n.p * 5.5;
          if (n.apagado) {
            return (
              <g key={i}>
                <circle cx={n.x} cy={n.y} r={r} fill="var(--color-background)" />
                {/* Anel visível e vazio: "apagado", não "erro". Vermelho num
                    herói assusta; o que a imagem precisa dizer é ausência. */}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={r}
                  fill="none"
                  stroke="var(--color-ink-500)"
                  strokeWidth="1.6"
                />
              </g>
            );
          }
          return (
            <g key={i}>
              <circle cx={n.x} cy={n.y} r={r * 3.6} fill="url(#halo)" opacity={n.p * 0.32} />
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill="var(--color-primary)"
                className="linka-no"
                style={{ animationDelay: `${(i % 5) * 0.7}s` }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
