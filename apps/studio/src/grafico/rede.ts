import { random } from "remotion";

/**
 * A geometria da rede que serve de fundo para a versão gráfica da peça.
 *
 * ── Por que ela não é enfeite ─────────────────────────────────────────────
 * A topologia é a do produto: cada **hub** é uma loja, cada **satélite** é um
 * aparelho de demonstração, cada **elo** é a ligação entre lojas por onde a
 * campanha viaja. Quando a onda de publicação atravessa a rede no cartão de
 * conteúdo, ela atravessa a mesma coisa que o cartão está dizendo.
 *
 * Fundo abstrato genérico (partículas, ondas, gradiente) é o que qualquer
 * peça de SaaS tem. Este só serve para a LINKA.
 *
 * ── Posições na mão, não sorteadas ────────────────────────────────────────
 * Nove hubs colocados um a um. Sorteio dá aglomerado e buraco: dois nós
 * quase colados num canto e um vazio de 600 px no outro. O olho pega isso
 * na hora, mesmo sem saber o que está olhando. O sorteio fica só para o que
 * é ruído de verdade — ângulo e raio dos satélites, fase de cada pulso.
 *
 * ── Determinismo ──────────────────────────────────────────────────────────
 * `random()` do Remotion é semeado: a mesma semente dá o mesmo número em
 * toda renderização. `Math.random()` aqui faria cada quadro sortear de novo
 * e a rede tremeria como chuvisco de TV.
 *
 * O espaço é o de uma tela de 1920×1080, mas com nós PARA FORA das bordas —
 * a rede tem que continuar além do quadro, senão vira um diagrama centrado.
 */

export type Satelite = {
  /** Deslocamento em relação ao hub, em px. */
  dx: number;
  dy: number;
  raio: number;
  /** Fase própria, para os satélites não respirarem em uníssono. */
  fase: number;
  /** Aparelho apagado. É o que a cena da frota acende em vermelho. */
  falha: boolean;
};

export type Hub = {
  id: number;
  x: number;
  y: number;
  /** 0 = ao fundo (pequeno, parallax lento) · 1 = à frente (grande, rápido). */
  z: number;
  fase: number;
  satelites: Satelite[];
};

export type Elo = {
  de: number;
  para: number;
  /** Comprimento em px. Governa o traço de entrada e o percurso do pulso. */
  comprimento: number;
  /** Deslocamento inicial do pulso, para os elos não pulsarem em bloco. */
  fase: number;
  /** Voltas por quadro do pulso neste elo. */
  velocidade: number;
};

/** [x, y, profundidade] — na mão, para a rede ter composição. */
const POSICOES = [
  [255, 268, 0.55],
  [618, 118, 0.28],
  [968, 352, 0.86],
  [1408, 164, 0.44],
  [1772, 430, 0.68],
  [150, 748, 0.38],
  [706, 896, 0.76],
  [1262, 752, 0.6],
  [1682, 952, 0.33],
] as const;

/** Quem fala com quem. Malha, não estrela: rede sem hub central. */
const LIGACOES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 2],
  [6, 7],
  [7, 8],
  [7, 4],
  [2, 7],
  [1, 5],
  [3, 8],
  [4, 8],
] as const;

/** Duas lojas com aparelho apagado — as mesmas duas do aviso do cartão. */
const EM_FALHA = [5, 7];

export const HUBS: Hub[] = POSICOES.map(([x, y, z], i) => {
  const quantos = 4 + Math.floor(random(`quantos-${i}`) * 3);
  const satelites: Satelite[] = Array.from({ length: quantos }, (_, k) => {
    const angulo = (k / quantos) * Math.PI * 2 + random(`ang-${i}-${k}`) * 0.85;
    const raio = 54 + random(`raio-${i}-${k}`) * 52;
    return {
      // 1,35 no eixo x: a órbita é elíptica, não um relógio de ponteiros.
      dx: Math.cos(angulo) * raio * 1.35,
      dy: Math.sin(angulo) * raio,
      raio: 2.1 + random(`tam-${i}-${k}`) * 1.7,
      fase: random(`fase-${i}-${k}`) * Math.PI * 2,
      falha: EM_FALHA.includes(i) && k === 1,
    };
  });
  return { id: i, x, y, z, fase: random(`hub-${i}`) * Math.PI * 2, satelites };
});

export const ELOS: Elo[] = LIGACOES.map(([de, para], i) => {
  const a = HUBS[de];
  const b = HUBS[para];
  return {
    de,
    para,
    comprimento: Math.hypot(b.x - a.x, b.y - a.y),
    fase: random(`elo-${i}`),
    velocidade: 0.0032 + random(`vel-${i}`) * 0.0022,
  };
});

/** O centro do quadro. A onda de publicação parte daqui — de dentro do painel. */
export const CENTRO = { x: 960, y: 540 } as const;

/**
 * A ordem em que a rede se forma: do centro para fora.
 *
 * ── Por que não é a ordem do array ────────────────────────────────────────
 * Porque os cinco primeiros hubs da lista estão todos na metade de cima. Com
 * a ordem do array, os dois primeiros segundos da peça tinham a metade de
 * baixo do quadro completamente preta — a abertura ficava torta e parecia
 * que a renderização não tinha terminado de carregar.
 *
 * Crescendo do centro para fora o quadro fica equilibrado em qualquer
 * instante da formação, e o gesto diz a coisa certa: a plataforma acende a
 * frota a partir de dentro.
 */
export const ORDEM_DE_FORMACAO: number[] = HUBS.map((h) => h.id).sort(
  (a, b) =>
    Math.hypot(HUBS[a].x - CENTRO.x, HUBS[a].y - CENTRO.y) -
    Math.hypot(HUBS[b].x - CENTRO.x, HUBS[b].y - CENTRO.y),
);

/** Posição do hub na fila de formação (0 = o primeiro a acender). */
export const POSICAO_NA_FILA: number[] = HUBS.map((h) => ORDEM_DE_FORMACAO.indexOf(h.id));
