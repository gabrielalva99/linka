import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";

/**
 * Como uma tela do painel entra em cena.
 *
 * ── O problema ────────────────────────────────────────────────────────────
 * Captura de tela é imagem parada. Aparecendo com um fade, ela lê como slide:
 * a peça inteira fica seca. O painel de verdade não aparece de uma vez — o
 * conteúdo assenta de cima para baixo enquanto carrega.
 *
 * ── A técnica ─────────────────────────────────────────────────────────────
 * A mesma imagem é desenhada N vezes, e cada cópia mostra só uma faixa
 * horizontal (via `clip-path`). Cada faixa entra com um atraso, subindo alguns
 * pixels e ganhando opacidade. Quando todas assentam, elas recompõem a captura
 * original — pixel por pixel, sem emenda.
 *
 * O ganho é que isso NÃO depende de saber onde está cada cartão. Não precisa
 * medir nada, não quebra quando o painel muda de layout, e dá a sensação de
 * conteúdo entrando em vez de foto aparecendo.
 *
 * O deslocamento é pequeno (12 px) de propósito: mais que isso e a emenda
 * entre as faixas fica visível durante a entrada.
 */

const FAIXAS = 9;
const SUBIDA = 12;
/** Atraso entre uma faixa e a seguinte. Espalha a entrada sem arrastar. */
const ATRASO = 3.5;
const ENTRADA_FAIXA = 22;

export function TelaQueAssenta({
  arquivo,
  inicio,
  escala,
  deslocaY,
  children,
}: {
  arquivo: string;
  /** Quadro em que a primeira faixa começa a entrar. */
  inicio: number;
  escala: number;
  /** Deslocamento vertical da câmera, em %. */
  deslocaY: number;
  children?: React.ReactNode;
}) {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ scale: escala, translate: `0px ${deslocaY}%` }}>
      {Array.from({ length: FAIXAS }, (_, i) => {
        const de = (i / FAIXAS) * 100;
        const ate = ((i + 1) / FAIXAS) * 100;
        const parte = inicio + i * ATRASO;

        const p = interpolate(frame, [parte, parte + ENTRADA_FAIXA], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        });

        return (
          <AbsoluteFill
            key={i}
            style={{
              clipPath: `inset(${de}% 0% ${100 - ate}% 0%)`,
              opacity: p,
              translate: `0px ${(1 - p) * SUBIDA}px`,
            }}
          >
            <Img
              src={staticFile(arquivo)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </AbsoluteFill>
        );
      })}
      {children}
    </AbsoluteFill>
  );
}

/** Quando a última faixa termina de entrar, contado a partir de `inicio`. */
export const DURACAO_DA_ENTRADA = (FAIXAS - 1) * ATRASO + ENTRADA_FAIXA;
