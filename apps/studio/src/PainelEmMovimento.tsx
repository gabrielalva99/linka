import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { COR, PILHA_DE_FONTE } from "./marca";
import { CartaoDados, CartaoFrota, CartaoPublicar } from "./painel/cartoes";
import { LinkaLogo } from "./painel/LinkaLogo";
import { Loja } from "./painel/Loja";
import { Pergunta } from "./painel/Pergunta";

/**
 * A peça de venda da LINKA — a loja e o painel, no mesmo quadro.
 *
 * ── A ideia ───────────────────────────────────────────────────────────────
 * Imagem de loja ao fundo; o painel flutuando por cima. Não é ilustração do
 * argumento, é o argumento: o H1 da página diz que "a loja física gera dado a
 * cada toque", e aqui o toque e o dado dividem a tela.
 *
 * ── O flow ────────────────────────────────────────────────────────────────
 *   0–4,5s    a loja sozinha. Mão pegando um aparelho do suporte.
 *   4,5–11s   "O aparelho está ligado?"              → a frota, linha a linha
 *   11–18s    "Está com a campanha certa?"           → publicar em 8 lojas
 *   18–26s    "Qual recurso o cliente mais procura?" → as barras e as horas
 *   26–29s    "No LINKA você acompanha" + três linhas
 *   29–30s    a marca
 *
 * ── 25 fps ────────────────────────────────────────────────────────────────
 * Igual à cadência dos clipes. A 30 o transcode duplicava um quadro a cada
 * cinco e a imagem engasgava — cinco micro-travadas por segundo, gravadas no
 * arquivo. Todos os tempos aqui são em quadros de 25: um segundo é 25.
 *
 * ── Onde as cenas se trocam ───────────────────────────────────────────────
 * O corte acontece com a PERGUNTA no auge, cobrindo a tela a 82%. Corte seco,
 * escondido: em 18% de visibilidade ninguém vê.
 *
 * **Nada de cruzar duas imagens de loja.** Duas cenas em meia opacidade não
 * somam uma — sobre o preto dão uma mistura escura no meio do caminho, a
 * segunda "clareia de repente" ao chegar em 100%, e enquanto dura aparecem as
 * duas lojas juntas. Ou a pergunta cobre o corte, ou a cena nova entra POR
 * CIMA de uma que continua opaca.
 *
 * ── E o cartão entra logo depois do corte ─────────────────────────────────
 * Ele já está se formando enquanto a pergunta sai. Quando esperava mais, a
 * tela ficava um segundo e meio escura com só a pergunta parada — a imagem
 * continuava andando por baixo, mas a 18% ninguém via, e lia como travada.
 *
 * ── A regra do dado ───────────────────────────────────────────────────────
 * Interface real com dado de exemplo: sim. Número de RESULTADO: não. Nenhum
 * percentual, comparação ou seta de crescimento em lugar nenhum.
 */

/** A linha do tempo, em quadros de 25 fps (750 quadros · 30 s). */
const T = {
  abertura: [0, 116],

  pergunta1: [100, 178],
  frota: [112, 272],

  pergunta2: [262, 340],
  publicar: [274, 452],

  pergunta3: [442, 520],
  dados: [454, 650],

  acompanha: [630, 724],
  fecho: [708, 750],
} as const;

const SUAVE = Easing.bezier(0.16, 1, 0.3, 1);

export const PainelEmMovimento: React.FC = () => {
  return (
    <AbsoluteFill name="LINKA" style={{ background: COR.fundo }}>
      <Cena janela={T.abertura} entrada={0}>
        <Loja arquivo="loja/tablet.mp4" inicio={T.abertura[0]} duracao={140} />
      </Cena>

      <Cena janela={T.frota} entrada={0}>
        <Loja arquivo="loja/bancada.mp4" inicio={T.frota[0]} duracao={170} />
        <Centro>
          <CartaoFrota inicio={T.frota[0] + 12} />
        </Centro>
      </Cena>

      <Cena janela={T.publicar} entrada={0}>
        <Loja arquivo="loja/vitrine.mp4" inicio={T.publicar[0]} duracao={190} />
        <Centro>
          <CartaoPublicar inicio={T.publicar[0] + 12} />
        </Centro>
      </Cena>

      <Cena janela={T.dados} entrada={0}>
        <Loja
          arquivo="loja/bancada.mp4"
          inicio={T.dados[0]}
          duracao={200}
          zoomDe={1.12}
          zoomPara={1.04}
        />
        <Centro>
          <CartaoDados inicio={T.dados[0] + 14} />
        </Centro>
      </Cena>

      <Cena janela={T.acompanha} entrada={22}>
        <Loja
          arquivo="loja/tablet.mp4"
          inicio={T.acompanha[0]}
          duracao={110}
          zoomDe={1.08}
          zoomPara={1.16}
          brilho={0.4}
        />
        <Acompanha inicio={T.acompanha[0]} />
      </Cena>

      <Pergunta janela={T.pergunta1} texto="O aparelho está ligado?" />
      <Pergunta janela={T.pergunta2} texto="Está com a campanha certa?" />
      <Pergunta janela={T.pergunta3} texto="Qual recurso o cliente mais procura?" />

      <Fecho />
    </AbsoluteFill>
  );
};

/**
 * Um trecho da peça.
 *
 * A cena NUNCA desbota na saída: fica opaca até o último quadro e some, porque
 * a próxima já cobriu a tela ou a pergunta está por cima escondendo o corte.
 * Fade só existe na ENTRADA, e sempre por cima de algo opaco.
 */
function Cena({
  janela,
  entrada,
  children,
}: {
  janela: readonly [number, number] | number[];
  /** Quadros de entrada. Zero = corte seco (o normal nesta peça). */
  entrada: number;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const [ini, fim] = janela as [number, number];
  if (frame < ini || frame > fim) return null;

  if (entrada === 0) return <AbsoluteFill>{children}</AbsoluteFill>;

  return (
    <AbsoluteFill
      style={{
        opacity: interpolate(frame, [ini, ini + entrada], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: SUAVE,
        }),
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {children}
    </AbsoluteFill>
  );
}

/**
 * O fechamento do argumento: o que a marca passa a acompanhar.
 *
 * As três linhas são AFIRMAÇÃO DE PRODUTO e todas são verdade hoje — foram
 * conferidas contra o que o painel entrega. Mexer aqui é mexer numa promessa
 * comercial, não num texto de tela.
 */
function Acompanha({ inicio }: { inicio: number }) {
  const frame = useCurrentFrame();
  const linhas = [
    "cada aparelho, em cada loja, agora",
    "a campanha que está no ar, e onde ela chegou",
    "quem pegou, por quanto tempo, e o que quis testar",
  ];

  const titulo = interpolate(frame, [inicio + 8, inicio + 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: SUAVE,
  });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 34, width: 1300 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            opacity: titulo,
            translate: `0px ${(1 - titulo) * 16}px`,
          }}
        >
          <span style={{ width: 46, height: 4, background: COR.verde, borderRadius: 2 }} />
          <span
            style={{
              fontFamily: PILHA_DE_FONTE,
              fontSize: 62,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: COR.texto,
            }}
          >
            No LINKA você acompanha
          </span>
        </div>

        {linhas.map((linha, i) => {
          const entra = inicio + 30 + i * 13;
          const p = interpolate(frame, [entra, entra + 24], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: SUAVE,
          });
          return (
            <div
              key={linha}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 22,
                paddingLeft: 66,
                opacity: p,
                translate: `${(1 - p) * -24}px 0px`,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: COR.verde,
                  flexShrink: 0,
                  boxShadow: `0 0 14px ${COR.verde}`,
                }}
              />
              <span
                style={{
                  fontFamily: PILHA_DE_FONTE,
                  fontSize: 40,
                  color: COR.verdeClaro,
                  letterSpacing: "-0.01em",
                }}
              >
                {linha}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/**
 * O fecho.
 *
 * ── Por que a marca não para de se mexer ──────────────────────────────────
 * A versão anterior terminava com um desbotamento lento para o preto. Os
 * quadros do fim ficavam quase pretos e IDÊNTICOS depois de comprimidos — 20
 * quadros repetidos, que é literalmente um vídeo congelado no final.
 *
 * Agora a marca cresce um triz durante todo o fecho, e o corte para o preto é
 * rápido, nos últimos oito quadros. Nenhum quadro repete, e o laço reencontra
 * a loja sem um trecho morto no meio.
 */
function Fecho() {
  const frame = useCurrentFrame();
  const [ini, fim] = T.fecho;
  if (frame < ini) return null;

  const fundo = interpolate(frame, [ini, ini + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const marca = interpolate(frame, [ini + 8, ini + 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: SUAVE,
  });
  const endereco = interpolate(frame, [ini + 18, ini + 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: SUAVE,
  });
  /** Crescimento contínuo: é o que impede dois quadros iguais no fim. */
  const respira = interpolate(frame, [ini, fim], [1, 1.04], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.linear,
  });
  /** Corte curto para o preto, nos últimos oito quadros. */
  const sai = interpolate(frame, [fim - 9, fim - 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        background: COR.fundo,
        opacity: fundo,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 46,
          opacity: sai,
          scale: respira,
        }}
      >
        <div style={{ opacity: marca, translate: `0px ${(1 - marca) * 16}px` }}>
          <LinkaLogo altura={124} />
        </div>
        <span
          style={{
            fontFamily: PILHA_DE_FONTE,
            fontSize: 30,
            letterSpacing: "0.04em",
            color: COR.fraco,
            opacity: endereco,
            translate: `0px ${(1 - endereco) * 10}px`,
          }}
        >
          linkaretail.com.br
        </span>
      </div>
    </AbsoluteFill>
  );
}
