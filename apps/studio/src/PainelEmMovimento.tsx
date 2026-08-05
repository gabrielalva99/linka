import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { COR, PILHA_DE_FONTE } from "./marca";
import { CartaoDados, CartaoFrota, CartaoPublicar } from "./painel/cartoes";
import { LinkaLogo } from "./painel/LinkaLogo";
import { Loja } from "./painel/Loja";
import { Pergunta } from "./painel/Pergunta";

/**
 * A peça de venda da LINKA — a loja e o painel, ao mesmo tempo.
 *
 * ── A ideia ───────────────────────────────────────────────────────────────
 * Imagem de loja ao fundo, escurecida; o painel flutuando por cima. Não é
 * ilustração do argumento, é o argumento: o H1 da página diz que "a loja
 * física gera dado a cada toque", e aqui o toque e o dado estão no mesmo
 * quadro.
 *
 * ── O flow ────────────────────────────────────────────────────────────────
 *   0–4s    a loja, sozinha. Mão pegando um aparelho do suporte. É onde o
 *           dado nasce, e onde ele se perde hoje.
 *   4–10s   "O aparelho está ligado?"              → a frota, linha a linha,
 *                                                    duas vermelhas, o aviso
 *   10–17s  "Está com a campanha certa?"           → publicar em 8 lojas,
 *                                                    e os 96 acendendo
 *   17–24s  "Qual recurso o cliente mais procura?" → as barras e as horas
 *   24–28s  "No LINKA você acompanha" + três linhas
 *   28–30s  a marca
 *
 * ── Por que um cartão de cada vez, e não o painel inteiro ─────────────────
 * O painel inteiro sobre a loja encolheria para dois terços do quadro, e a
 * fonte de 19 px viraria 12 px na tela de quem assiste. Um cartão só, grande,
 * responde a pergunta e ainda pode ser lido.
 *
 * ── O que morreu no caminho, para não voltar ──────────────────────────────
 * Captura de tela com truque por cima. A imagem era fatiada em faixas para
 * "entrar" (as emendas apareciam, cortando o cartão da Loja Sul ao meio) e a
 * câmera dava zoom sobre ela (comia 35 px de cada lado e decepava o menu
 * lateral). Foto não tem partes para animar. Agora cada linha entra porque
 * ela É uma linha.
 *
 * ── A regra do dado ───────────────────────────────────────────────────────
 * Interface real com dado de exemplo: sim. Número de RESULTADO: não. Não há
 * percentual de conversão, comparação nem seta de crescimento em lugar
 * nenhum. Esse é o número que a marca cobra na reunião seguinte.
 *
 * ── Laço ──────────────────────────────────────────────────────────────────
 * Abre no preto e fecha no preto. Roda em `loop` sem emenda.
 */

/**
 * A linha do tempo inteira, em quadros (30 fps · 900 quadros · 30 s).
 *
 * ── Onde as cenas se trocam, e por quê ────────────────────────────────────
 * O corte de uma cena para a outra acontece com a PERGUNTA no auge, cobrindo
 * a tela a 82%. É corte seco, escondido: em 18% de visibilidade ninguém vê.
 *
 * Antes era transição cruzada, e ela tinha dois defeitos ao mesmo tempo. Duas
 * cenas em meia opacidade não somam uma — empilhadas sobre o preto davam uma
 * mistura suja e escura no meio do caminho, e depois a segunda "clareava de
 * repente" ao chegar em 100%. E enquanto durava, as duas lojas apareciam
 * sobrepostas na tela.
 *
 * A regra que vale daqui em diante: **nada de cruzar duas imagens de loja.**
 * Ou a pergunta cobre o corte, ou a cena nova entra POR CIMA de uma que
 * continua opaca — nunca as duas desbotando ao mesmo tempo.
 */
const T = {
  abertura: [0, 136],

  pergunta1: [120, 196],
  frota: [134, 316],

  pergunta2: [300, 376],
  publicar: [314, 526],

  pergunta3: [510, 594],
  dados: [524, 758],

  acompanha: [730, 858],
  fecho: [842, 900],
} as const;

const SUAVE = Easing.bezier(0.16, 1, 0.3, 1);

export const PainelEmMovimento: React.FC = () => {
  return (
    <AbsoluteFill name="LINKA" style={{ background: COR.fundo }}>
      <Cena janela={T.abertura} entrada={0}>
        <Loja arquivo="loja/tablet.mp4" inicio={T.abertura[0]} duracao={150} />
      </Cena>

      <Cena janela={T.frota} entrada={0}>
        <Loja arquivo="loja/bancada.mp4" inicio={T.frota[0]} duracao={190} />
        <Centro>
          <CartaoFrota inicio={T.frota[0] + 46} />
        </Centro>
      </Cena>

      <Cena janela={T.publicar} entrada={0}>
        <Loja arquivo="loja/vitrine.mp4" inicio={T.publicar[0]} duracao={218} />
        <Centro>
          <CartaoPublicar inicio={T.publicar[0] + 46} />
        </Centro>
      </Cena>

      <Cena janela={T.dados} entrada={0}>
        <Loja arquivo="loja/bancada.mp4" inicio={T.dados[0]} duracao={240} zoomDe={1.14} zoomPara={1.06} />
        <Centro>
          <CartaoDados inicio={T.dados[0] + 52} />
        </Centro>
      </Cena>

      <Cena janela={T.acompanha} entrada={24}>
        <Loja arquivo="loja/tablet.mp4" inicio={T.acompanha[0]} duracao={134} zoomDe={1.1} zoomPara={1.2} />
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
 * ── A cena NUNCA desbota na saída ─────────────────────────────────────────
 * Ela fica opaca até o último quadro e simplesmente some — porque a próxima
 * já cobriu a tela, ou porque a pergunta está por cima escondendo o corte.
 *
 * Desbotar na saída era o defeito: duas cenas em meia opacidade sobre o preto
 * dão uma mistura escura, e ainda mostram as duas lojas ao mesmo tempo. Fade
 * só existe aqui na ENTRADA, e sempre por cima de algo opaco.
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

  const titulo = interpolate(frame, [inicio + 8, inicio + 34], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: SUAVE,
  });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {/* Véu extra só nesta cena. Nas outras o cartão do painel é opaco e
          segura a leitura sozinho; aqui o texto fica direto sobre a imagem, e
          a manga clara do casaco passava por trás das linhas. */}
      <AbsoluteFill style={{ background: COR.fundo, opacity: 0.55 }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 30, width: 1160 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            opacity: titulo,
            translate: `0px ${(1 - titulo) * 16}px`,
          }}
        >
          <span style={{ width: 42, height: 4, background: COR.verde, borderRadius: 2 }} />
          <span
            style={{
              fontFamily: PILHA_DE_FONTE,
              fontSize: 56,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: COR.texto,
            }}
          >
            No LINKA você acompanha
          </span>
        </div>

        {linhas.map((linha, i) => {
          const entra = inicio + 34 + i * 16;
          const p = interpolate(frame, [entra, entra + 26], [0, 1], {
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
                gap: 20,
                paddingLeft: 60,
                opacity: p,
                translate: `${(1 - p) * -22}px 0px`,
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 999,
                  background: COR.verde,
                  flexShrink: 0,
                  boxShadow: `0 0 12px ${COR.verde}`,
                }}
              />
              <span
                style={{
                  fontFamily: PILHA_DE_FONTE,
                  fontSize: 36,
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

/** A marca pousa, e o endereço vem atrás. */
function Fecho() {
  const frame = useCurrentFrame();
  if (frame < T.fecho[0]) return null;

  const fundo = interpolate(frame, [T.fecho[0], T.fecho[0] + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const marca = interpolate(frame, [T.fecho[0] + 10, T.fecho[0] + 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: SUAVE,
  });
  const endereco = interpolate(frame, [T.fecho[0] + 24, T.fecho[0] + 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: SUAVE,
  });
  const sai = interpolate(frame, [T.fecho[1] - 16, T.fecho[1]], [1, 0], {
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
          gap: 28,
          opacity: sai,
        }}
      >
        <div
          style={{
            opacity: marca,
            translate: `0px ${(1 - marca) * 16}px`,
            scale: 0.96 + marca * 0.04,
          }}
        >
          <LinkaLogo altura={112} />
        </div>
        <span
          style={{
            fontFamily: PILHA_DE_FONTE,
            fontSize: 25,
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
