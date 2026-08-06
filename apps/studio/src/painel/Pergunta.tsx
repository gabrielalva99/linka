import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { COR, PILHA_DE_FONTE } from "../marca";

/**
 * A pergunta em tela cheia, palavra por palavra.
 *
 * ── Por que não é um fade só ──────────────────────────────────────────────
 * Frase inteira aparecendo de uma vez é o movimento mais seco que existe:
 * acontece num quadro e acabou. Entrando palavra a palavra, o olho acompanha
 * a leitura — e a frase leva o tempo que leva para ser lida, em vez de ficar
 * parada esperando.
 *
 * O traço verde à esquerda cresce antes da primeira palavra: ele é o que dá
 * a sensação de que algo vai começar, em vez de já ter começado.
 *
 * ── A cortina ─────────────────────────────────────────────────────────────
 * Da segunda pergunta em diante ela cobre a tela anterior e sai revelando a
 * próxima. Corte seco entre duas capturas de painel lê como emenda de
 * gravação; a cortina faz a troca virar parte da narrativa.
 */

const SUAVE = Easing.bezier(0.16, 1, 0.3, 1);

export function Pergunta({
  janela,
  texto,
}: {
  janela: readonly [number, number] | number[];
  texto: string;
}) {
  const frame = useCurrentFrame();
  const [ini, fim] = janela as [number, number];
  if (frame < ini - 6 || frame > fim + 6) return null;

  /* A cortina escurece a loja sem apagá-la: a pergunta é feita POR CIMA da
     cena, não no lugar dela. Corte para preto entre cada pergunta partiria a
     peça em três filmes soltos. */
  const cortina = interpolate(frame, [ini, ini + 12, fim - 30, fim], [0, 0.82, 0.82, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: SUAVE,
  });

  /**
 * A saída é junta — palavra por palavra na ida, tudo junto na volta — mas
 * LENTA: 26 quadros, mais de um segundo.
 *
 * Já foi de 15 quadros, e a frase sumia antes de ser lida. Medindo a versão
 * antiga: a pergunta de seis palavras ficava inteira e parada na tela por 18
 * quadros, 0,72 s. Ninguém lê "Qual recurso o cliente mais procura?" nesse
 * tempo. Agora são 22 quadros parada mais 26 saindo — cerca de 2 s legíveis
 * depois de a frase estar completa.
 */
  const saida = interpolate(frame, [fim - 36, fim - 10], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: SUAVE,
  });

  const traco = interpolate(frame, [ini + 5, ini + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: SUAVE,
  });

  const palavras = texto.split(" ");

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        background: COR.fundo,
        opacity: cortina,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20, opacity: saida }}>
        <span
          style={{
            width: 42 * traco,
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
            const entra = ini + 12 + i * 4;
            const p = interpolate(frame, [entra, entra + 20], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: SUAVE,
            });
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  opacity: p,
                  translate: `0px ${(1 - p) * 22}px`,
                  // O leve encolhimento na entrada tira o ar de "texto que
                  // simplesmente ligou" e dá peso à palavra chegando.
                  scale: 0.94 + p * 0.06,
                }}
              >
                {palavra}
              </span>
            );
          })}
        </span>
      </div>
    </AbsoluteFill>
  );
}
