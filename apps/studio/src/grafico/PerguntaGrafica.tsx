import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COR, PILHA_DE_FONTE } from "../marca";
import { CENA, ENTRA, SAI } from "../curvas";
import {
  ENTRADA_DA_CORTINA,
  PARADA,
  PASSO_DA_PALAVRA,
  RAMPA_DA_PALAVRA,
  SAIDA,
} from "../painel/Pergunta";

/**
 * A pergunta, na versão gráfica.
 *
 * O relógio é O MESMO da versão com imagem de loja — as constantes vêm de
 * `painel/Pergunta`, não são recopiadas aqui. Só o tratamento muda. Duas
 * versões da mesma peça com cadências diferentes não são comparáveis: a
 * escolha viraria "qual ritmo eu prefiro", quando a pergunta é outra.
 *
 * ── O que muda, e por quê ─────────────────────────────────────────────────
 * Lá a cortina precisava chegar a 82% de preto porque era ela que escondia o
 * corte entre dois clipes de vídeo. Aqui não há corte nenhum para esconder: o
 * fundo é contínuo. Então em vez de APAGAR a cena, a pergunta a DESFOCA —
 * `backdropFilter` tira a rede de foco e a traz de volta, como uma troca de
 * foco de lente. O fundo continua vivo por trás do texto o tempo todo, e a
 * profundidade fica explícita: o texto está na frente, a rede está atrás.
 *
 * ── A saída é escalonada, não em bloco ────────────────────────────────────
 * As palavras saem na ordem em que entraram, com poucos quadros entre uma e
 * outra. O intervalo é curto de propósito (1,6 quadro): o suficiente para a
 * frase se desfazer em vez de se apagar, sem virar efeito.
 */

const PASSO_DA_SAIDA = 1.6;
const RAMPA_DA_SAIDA = 22;

export function PerguntaGrafica({
  janela,
  texto,
  indice,
}: {
  janela: readonly [number, number] | number[];
  texto: string;
  /** 1, 2, 3 — o contador editorial acima da frase. */
  indice: number;
}) {
  const frame = useCurrentFrame();
  const [ini, fim] = janela as [number, number];
  if (frame < ini - 4 || frame > fim + 4) return null;

  const palavras = texto.trim().split(/\s+/);
  /** Quadro em que a última palavra termina de pousar. */
  const pronta =
    ini + ENTRADA_DA_CORTINA + (palavras.length - 1) * PASSO_DA_PALAVRA + RAMPA_DA_PALAVRA;
  const comecaASair = pronta + PARADA;

  /** Presença da camada: governa o desfoque e o véu, não o texto. */
  const camada = interpolate(
    frame,
    [ini, ini + ENTRADA_DA_CORTINA, comecaASair + 8, fim],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: CENA },
  );

  const traco = interpolate(frame, [ini + 4, ini + 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRA,
  });
  const saiTraco = interpolate(frame, [comecaASair + 6, comecaASair + SAIDA], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: SAI,
  });

  const numero = interpolate(frame, [ini + 8, ini + 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRA,
  });
  const saiNumero = interpolate(frame, [comecaASair, comecaASair + 20], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: SAI,
  });

  return (
    <>
      {/* Troca de foco: a rede sai de foco, o texto entra na frente dela.
          O desfoque e o véu são MENORES do que pareceria natural (7 px, 56%)
          porque a varredura mostrou o problema: com a rede desfocada e coberta,
          a pausa de leitura virava o trecho mais parado da peça inteira. É
          justamente quando nada mais se mexe que o fundo precisa ser visível. */}
      <AbsoluteFill
        style={{
          backdropFilter: `blur(${camada * 7}px) saturate(${1 - camada * 0.3})`,
          background: `${COR.fundo}${hex(camada * 0.56)}`,
        }}
      />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 30,
            /* NÃO PONHA DERIVA AQUI.
               Já teve um seno de 3 px neste bloco, para a frase não ficar
               cravada na tela durante os 38 quadros de pausa. O efeito real
               foi outro: 84 px de texto deslocando em fração de pixel a cada
               quadro re-rasteriza cada letra, o antisserrilhado muda junto e a
               frase inteira ferve — enquanto se lê, que é a pior hora.
               Quem enche a pausa é a régua abaixo e o fundo atrás. */
          }}
        >
          {/* contador editorial — dá lugar à pergunta dentro de uma série */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              opacity: numero * saiNumero,
              translate: `0px ${(1 - numero) * 14}px`,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: COR.verde,
                boxShadow: `0 0 14px ${COR.verde}`,
              }}
            />
            <span
              style={{
                fontFamily: PILHA_DE_FONTE,
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "0.34em",
                color: COR.verde,
              }}
            >
              {String(indice).padStart(2, "0")}
              <span style={{ color: COR.fraco }}> / 03</span>
            </span>
          </div>

          <span
            style={{
              fontFamily: PILHA_DE_FONTE,
              fontSize: 84,
              fontWeight: 700,
              letterSpacing: "-0.035em",
              color: COR.texto,
              display: "flex",
              gap: "0.26em",
              textAlign: "center",
            }}
          >
            {palavras.map((palavra, i) => {
              const entra = ini + ENTRADA_DA_CORTINA + i * PASSO_DA_PALAVRA;
              const p = interpolate(frame, [entra, entra + RAMPA_DA_PALAVRA], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ENTRA,
              });
              const saiEm = comecaASair + i * PASSO_DA_SAIDA;
              const s = interpolate(frame, [saiEm, saiEm + RAMPA_DA_SAIDA], [1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: SAI,
              });
              return (
                <span
                  key={i}
                  style={{
                    display: "inline-block",
                    opacity: p * s,
                    // Entra de baixo e sai por cima: a frase tem direção.
                    translate: `0px ${(1 - p) * 30 - (1 - s) * 16}px`,
                    scale: (0.92 + p * 0.08) * (0.98 + s * 0.02),
                    filter: `blur(${(1 - p) * 7 + (1 - s) * 5}px)`,
                  }}
                >
                  {palavra}
                </span>
              );
            })}
          </span>

          {/* Régua sob a frase — fecha o bloco e some antes das palavras.
              A luz corre por dentro dela, como nos elos da rede: é o que
              mantém o quadro vivo durante os 38 quadros de pausa de leitura,
              sem inventar movimento no texto (texto que se mexe enquanto se lê
              é pior do que texto parado). */}
          <span
            style={{
              width: 620 * traco * saiTraco,
              height: 3,
              borderRadius: 2,
              background: `linear-gradient(90deg, transparent 0%, ${COR.verde} 50%, transparent 100%)`,
              backgroundSize: "260px 100%",
              backgroundRepeat: "repeat-x",
              backgroundPositionX: `${(frame * 2.6) % 260}px`,
              opacity: 0.9,
            }}
          />
        </div>
      </AbsoluteFill>
    </>
  );
}

/** 0..1 → par hexadecimal de alfa, para colar em `#rrggbb`. */
function hex(a: number) {
  return Math.round(Math.min(1, Math.max(0, a)) * 255)
    .toString(16)
    .padStart(2, "0");
}
