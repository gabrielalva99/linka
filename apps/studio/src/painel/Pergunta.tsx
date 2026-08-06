import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COR, PILHA_DE_FONTE } from "../marca";
import { CENA, ENTRA, SAI } from "../curvas";

/**
 * A pergunta em tela cheia, palavra por palavra.
 *
 * ── A janela é DERIVADA da frase, não fixa ────────────────────────────────
 * As três perguntas tinham janela de 110 quadros cada. Como as palavras entram
 * escalonadas, quanto mais palavras a frase tem, mais tarde ela fica pronta —
 * e menos tempo parada sobrava. O resultado era o inverso do necessário:
 *
 *     "O aparelho está ligado?"               4 palavras   1,20 s parada
 *     "Está com a campanha certa?"            5 palavras   1,04 s
 *     "Qual recurso o cliente mais procura?"  6 palavras   0,88 s  ← a pior
 *
 * A frase mais longa ganhava o menor tempo de leitura. Agora a saída é
 * ancorada em QUANDO A ÚLTIMA PALAVRA POUSA, e a janela cresce sozinha com o
 * tamanho da frase. Todas ficam paradas o mesmo tempo, com folga.
 *
 * Use `quadrosDe()` para calcular a janela — não escreva o número na mão.
 *
 * ── A cortina e o texto são IRMÃOS, não pai e filho ───────────────────────
 * O texto morava dentro do elemento que carrega a cortina, então a opacidade
 * efetiva era `cortina × saida`. A saída "de 26 quadros" acontecia em 8, e o
 * texto nunca passava de 82% de branco. Agora são duas camadas irmãs: a
 * cortina escurece a cena, o texto tem a própria curva e o próprio branco.
 *
 * ── Por que a cortina não apaga a cena ────────────────────────────────────
 * Ela vai a 82% (ou menos), não a 100%. A imagem de loja continua viva por
 * trás — e é debaixo dela que o corte entre cenas acontece, invisível.
 */

const ENTRADA_DA_CORTINA = 14;
const PASSO_DA_PALAVRA = 4;
const RAMPA_DA_PALAVRA = 20;
/** Quanto tempo a frase fica inteira e imóvel, antes de começar a sair. */
const PARADA = 38;
const SAIDA = 30;

/** Quantos quadros esta frase precisa. A janela nasce do texto. */
export function quadrosDe(texto: string) {
  const palavras = texto.trim().split(/\s+/).length;
  return (
    ENTRADA_DA_CORTINA +
    (palavras - 1) * PASSO_DA_PALAVRA +
    RAMPA_DA_PALAVRA +
    PARADA +
    SAIDA
  );
}

/** Em que quadro, relativo ao início, a cortina já cobriu a cena. */
export const CORTINA_CHEIA = ENTRADA_DA_CORTINA;

/** Em que quadro, relativo ao início, a cena volta a aparecer limpa. */
export function revelaEm(texto: string) {
  const palavras = texto.trim().split(/\s+/).length;
  return (
    ENTRADA_DA_CORTINA + (palavras - 1) * PASSO_DA_PALAVRA + RAMPA_DA_PALAVRA + PARADA + 6
  );
}

export function Pergunta({
  janela,
  texto,
  /** A cortina clareia ao longo da peça, para o miolo não virar um platô. */
  cobertura = 0.82,
}: {
  janela: readonly [number, number] | number[];
  texto: string;
  cobertura?: number;
}) {
  const frame = useCurrentFrame();
  const [ini, fim] = janela as [number, number];
  if (frame < ini - 4 || frame > fim + 4) return null;

  const palavras = texto.trim().split(/\s+/);
  /** Quadro em que a última palavra termina de pousar. */
  const pronta =
    ini + ENTRADA_DA_CORTINA + (palavras.length - 1) * PASSO_DA_PALAVRA + RAMPA_DA_PALAVRA;
  const comecaASair = pronta + PARADA;

  const cortina = interpolate(
    frame,
    [ini, ini + ENTRADA_DA_CORTINA, comecaASair + 6, fim],
    [0, cobertura, cobertura, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: CENA },
  );

  const saida = interpolate(frame, [comecaASair, comecaASair + SAIDA], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: SAI,
  });

  const traco = interpolate(frame, [ini + 5, ini + 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRA,
  });

  return (
    <>
      {/* a cortina escurece a cena */}
      <AbsoluteFill style={{ background: COR.fundo, opacity: cortina }} />

      {/* o texto vive por fora dela, com o próprio branco e a própria saída */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, opacity: saida }}>
          <span
            style={{
              width: 48 * traco,
              height: 4,
              background: COR.verde,
              borderRadius: 2,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: PILHA_DE_FONTE,
              fontSize: 80,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: COR.texto,
              display: "flex",
              gap: "0.28em",
            }}
          >
            {palavras.map((palavra, i) => {
              const entra = ini + ENTRADA_DA_CORTINA + i * PASSO_DA_PALAVRA;
              const p = interpolate(frame, [entra, entra + RAMPA_DA_PALAVRA], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ENTRA,
              });
              return (
                <span
                  key={i}
                  style={{
                    display: "inline-block",
                    opacity: p,
                    translate: `0px ${(1 - p) * 26}px`,
                    // O encolhimento na entrada tira o ar de "texto que ligou".
                    scale: 0.93 + p * 0.07,
                  }}
                >
                  {palavra}
                </span>
              );
            })}
          </span>
        </div>
      </AbsoluteFill>
    </>
  );
}
