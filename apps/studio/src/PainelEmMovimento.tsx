import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { COR, PILHA_DE_FONTE } from "./marca";
import { LinkaLogo } from "./painel/LinkaLogo";
import { Cursor, ENTRADA } from "./painel/pecas";

/**
 * O painel da LINKA em movimento — peça de venda para a página.
 *
 * ── O que mudou, e por que importa ────────────────────────────────────────
 * A primeira versão desta peça era uma interface que EU desenhei imitando o
 * painel. Ficava bonita e não provava nada: era ilustração do produto, não o
 * produto. Agora são capturas do painel de verdade, em produção.
 *
 * O caminho para produzi-las está em `capturar-painel.md`, ao lado. Em
 * resumo: rede de demonstração criada no banco real com nomes neutros, telas
 * capturadas pelo navegador, e a rede apagada em seguida. A interface é
 * genuína; o dado é de exemplo e não afirma resultado nenhum.
 *
 * ── O que ele conta ───────────────────────────────────────────────────────
 * As TRÊS PERGUNTAS da seção 01 da página, e a tela do painel que responde
 * cada uma. Nada aqui é escolhido por ser bonito:
 *
 *   "O aparelho está ligado?"              → visão geral: 2 caídos em 12,
 *                                            com loja, motivo e há quanto tempo
 *   "Está com a campanha certa?"           → frota: 10/10 com o vídeo certo,
 *                                            10/10 protegidos, 10/10 atualizados
 *   "Qual recurso o cliente mais procura?" → o que o visitante quis testar,
 *                                            e o movimento hora a hora
 *
 * Mudou uma pergunta aqui? MUDE TAMBÉM na seção 01 da página. O encaixe entre
 * as duas é o que faz o vídeo pertencer ao site.
 *
 * ── Resolução ─────────────────────────────────────────────────────────────
 * A composição é 1760×990 porque é o tamanho NATIVO das capturas. Ampliar
 * para 2400 borraria o texto do painel — pixel interpolado é pior que pixel
 * verdadeiro, e num vídeo cheio de tabela isso aparece na hora.
 *
 * ── Laço ──────────────────────────────────────────────────────────────────
 * Abre no preto e fecha no preto. Roda em `loop` sem emenda.
 */

/** A linha do tempo inteira, em quadros (30 fps · 900 quadros · 30 s). */
const T = {
  pergunta1: [12, 104],
  visao: [96, 322],

  pergunta2: [322, 402],
  frota: [396, 612],

  pergunta3: [612, 692],
  testar: [686, 792],
  hora: [788, 840],

  fecho: [836, 900],
} as const;

export const PainelEmMovimento: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill name="Painel em movimento" style={{ background: COR.fundo }}>
      {/* Cada tela do painel entra, respira com um leve avanço de câmera, e sai.
          O movimento é de 3%: o suficiente para não parecer um slide parado, e
          pouco o bastante para ninguém tentar ler um texto que está andando. */}
      <Tela arquivo="painel/visao.png" janela={T.visao} zoomDe={1.0} zoomPara={1.035} focoY={-2} />
      <Tela arquivo="painel/frota.png" janela={T.frota} zoomDe={1.03} zoomPara={1.0} focoY={0} />
      <Tela arquivo="painel/testar.png" janela={T.testar} zoomDe={1.0} zoomPara={1.04} focoY={3} />
      <Tela arquivo="painel/hora.png" janela={T.hora} zoomDe={1.04} zoomPara={1.0} focoY={-3} />

      <CursorNoAviso frame={frame} />

      <Pergunta frame={frame} janela={T.pergunta1} texto="O aparelho está ligado?" primeira />
      <Pergunta frame={frame} janela={T.pergunta2} texto="Está com a campanha certa?" />
      <Pergunta frame={frame} janela={T.pergunta3} texto="Qual recurso o cliente mais procura?" />

      <Fecho frame={frame} />
    </AbsoluteFill>
  );
};

/** Quantos quadros a câmera leva para assentar. Depois disso ela PARA. */
const ASSENTA = 52;

/**
 * Uma captura do painel, com avanço de câmera que assenta.
 *
 * O `zoom` é sempre pequeno e a direção alterna entre as telas: entrar sempre
 * para dentro dá enjoo, e alternar dá ritmo sem que ninguém perceba por quê.
 *
 * ── Por que a câmera para depois de dois segundos ─────────────────────────
 * Duas razões, e as duas são fortes.
 *
 * Legibilidade: ninguém lê uma tabela que está andando. O movimento serve
 * para a tela entrar viva; a partir daí ele só atrapalha.
 *
 * Tamanho do arquivo: zoom contínuo sobre captura de tela é o pior caso do
 * H.264 — todo pixel muda em todo quadro e nada pode ser reaproveitado.
 * Medido nesta peça, no mesmo `crf 20`:
 *
 *     movimento até o fim   8,20 MB
 *     câmera assentando     3,72 MB   ← mesma qualidade, metade do arquivo
 *
 * Não foi compressão mais agressiva: foi parar de mexer no que não precisava
 * se mexer. O arquivo que vai para o site usa `crf 23` (2,90 MB), que é onde
 * a perda ainda não aparece no texto das tabelas.
 */
function Tela({
  arquivo,
  janela,
  zoomDe,
  zoomPara,
  focoY,
}: {
  arquivo: string;
  janela: readonly [number, number] | number[];
  zoomDe: number;
  zoomPara: number;
  /** Deslocamento vertical em %, para a câmera não ficar sempre no centro. */
  focoY: number;
}) {
  const frame = useCurrentFrame();
  const [ini, fim] = janela as [number, number];
  if (frame < ini - 4 || frame > fim + 4) return null;

  return (
    <AbsoluteFill
      style={{
        opacity: interpolate(frame, [ini, ini + 14, fim - 12, fim], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ENTRADA,
        }),
      }}
    >
      <Img
        src={staticFile(arquivo)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          scale: interpolate(frame, [ini, ini + ASSENTA], [zoomDe, zoomPara], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.22, 1, 0.3, 1),
          }),
          translate: `0px ${interpolate(frame, [ini, ini + ASSENTA], [0, focoY], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.22, 1, 0.3, 1),
          })}%`,
        }}
      />
    </AbsoluteFill>
  );
}

/**
 * A pergunta em tela cheia.
 *
 * Da segunda em diante ela vem sobre uma cortina preta que cobre a tela
 * anterior e sai revelando a próxima. Corte seco entre duas capturas de
 * painel lê como emenda de gravação; a cortina faz a troca virar narrativa.
 */
function Pergunta({
  frame,
  janela,
  texto,
  primeira = false,
}: {
  frame: number;
  janela: readonly [number, number] | number[];
  texto: string;
  primeira?: boolean;
}) {
  const [ini, fim] = janela as [number, number];
  if (frame < ini - 6 || frame > fim + 6) return null;

  const cortina = primeira
    ? 1
    : interpolate(frame, [ini, ini + 16, fim - 20, fim], [0, 1, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: ENTRADA,
      });

  const aparece = interpolate(frame, [ini + 8, ini + 30, fim - 26, fim - 8], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRADA,
  });

  const sobe = interpolate(frame, [ini + 8, ini + 34], [24, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRADA,
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        background: COR.fundo,
        opacity: cortina,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          opacity: aparece,
          translate: `0px ${sobe}px`,
        }}
      >
        <span style={{ width: 42, height: 4, background: COR.verde, borderRadius: 2 }} />
        <span
          style={{
            fontFamily: PILHA_DE_FONTE,
            fontSize: 74,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: COR.texto,
          }}
        >
          {texto}
        </span>
      </div>
    </AbsoluteFill>
  );
}

/**
 * O cursor indo até o aviso de aparelho caído, na tela de visão geral.
 *
 * É o que transforma "tela bonita" em "alguém operando". As coordenadas são
 * do quadro de 1760×990 e miram o cartão da Loja Centro — se a captura for
 * refeita e o layout mudar, elas precisam ser reconferidas.
 */
function CursorNoAviso({ frame }: { frame: number }) {
  const ini = 190;
  const fim = 250;
  if (frame < ini - 30 || frame > fim + 16) return null;

  const p = interpolate(frame, [ini - 30, ini], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRADA,
  });

  return (
    <Cursor
      x={interpolate(p, [0, 1], [1180, 620])}
      y={interpolate(p, [0, 1], [820, 336])}
      clicando={interpolate(frame, [ini + 4, ini + 28], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })}
      opacidade={interpolate(frame, [fim, fim + 14], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })}
    />
  );
}

function Fecho({ frame }: { frame: number }) {
  if (frame < T.fecho[0]) return null;
  const entra = interpolate(frame, [T.fecho[0] + 10, T.fecho[0] + 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRADA,
  });
  const sai = interpolate(frame, [T.fecho[1] - 20, T.fecho[1]], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        background: COR.fundo,
        opacity: interpolate(frame, [T.fecho[0], T.fecho[0] + 18], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 30,
          opacity: entra * sai,
        }}
      >
        <LinkaLogo altura={118} />
        <span style={{ fontFamily: PILHA_DE_FONTE, fontSize: 26, color: COR.fraco }}>
          linkaretail.com.br
        </span>
      </div>
    </AbsoluteFill>
  );
}
