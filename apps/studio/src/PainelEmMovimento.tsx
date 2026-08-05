import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { COR, PILHA_DE_FONTE } from "./marca";
import { Contador, Varredura } from "./painel/destaques";
import { TelaQueAssenta } from "./painel/entradas";
import { LinkaLogo } from "./painel/LinkaLogo";
import { Cursor, ENTRADA } from "./painel/pecas";
import { Pergunta } from "./painel/Pergunta";

/**
 * O painel da LINKA em movimento — peça de venda para a página.
 *
 * ── As capturas são do painel de verdade ──────────────────────────────────
 * Não é uma interface desenhada imitando o produto. São telas de produção,
 * fotografadas com uma rede de demonstração de nomes neutros que é criada e
 * apagada. Caminho em `capturar-painel.md`, semeadura em `demo/semear.sql`.
 *
 * ── O que ele conta ───────────────────────────────────────────────────────
 * As TRÊS PERGUNTAS da seção 01 da página, e a tela que responde cada uma:
 *
 *   "O aparelho está ligado?"              → visão geral: 2 caídos em 12, com
 *                                            loja, motivo e há quanto tempo
 *   "Está com a campanha certa?"           → campanhas em camadas, e a frota
 *                                            com 10/10 tocando o vídeo certo
 *   "Qual recurso o cliente mais procura?" → o que o visitante quis testar, e
 *                                            o movimento hora a hora
 *
 * Mudou uma pergunta aqui? MUDE TAMBÉM na seção 01 da página.
 *
 * ── O movimento, e por que ele é assim ────────────────────────────────────
 * A primeira versão era fade-entra, zoom tímido, fade-sai. Lia como slide.
 * Agora cada peça tem seu próprio movimento, e nenhum é decorativo:
 *
 *   tela        entra em faixas, de cima para baixo, como conteúdo carregando
 *   câmera      avança e ASSENTA em dois segundos
 *   troca       a tela que sai sobe e desbota, a de baixo já está entrando
 *   pergunta    palavra por palavra, no ritmo de quem lê
 *   números     contam de zero
 *   barras      crescem por varredura, sendo descobertas da esquerda
 *   cursor      viaja com desaceleração e clica no aviso
 *
 * ── Resolução ─────────────────────────────────────────────────────────────
 * 1760×990 é o tamanho NATIVO das capturas. Ampliar borraria o texto das
 * tabelas: pixel interpolado é pior que pixel verdadeiro.
 *
 * ── Laço ──────────────────────────────────────────────────────────────────
 * Abre no preto e fecha no preto. Roda em `loop` sem emenda.
 */

/** A linha do tempo inteira, em quadros (30 fps · 900 quadros · 30 s). */
const T = {
  pergunta1: [12, 104],
  visao: [96, 322],

  pergunta2: [322, 402],
  campanhas: [396, 530],
  frota: [524, 612],

  pergunta3: [612, 692],
  testar: [686, 790],
  hora: [786, 840],

  fecho: [836, 900],
} as const;

/** Quantos quadros a câmera leva para assentar. Depois disso ela PARA. */
const ASSENTA = 54;

export const PainelEmMovimento: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill name="Painel em movimento" style={{ background: COR.fundo }}>
      <Tela arquivo="painel/visao.png" janela={T.visao} zoomDe={1.0} zoomPara={1.04} focoY={-2}>
        {/* Os dois cartões do topo contam de zero. As coordenadas vieram do
            `getBoundingClientRect()` do navegador na hora da captura, e ficam
            DENTRO da transformação da imagem para acompanharem o zoom. */}
        <Contador
          x={558} y={176} w={90} h={32} ate={2} inicio={T.visao[0] + 52}
          tamanho={24} cor={COR.atencao} fundo="#121513"
        />
        <Contador
          x={862} y={176} w={90} h={32} ate={2} inicio={T.visao[0] + 60}
          tamanho={24} cor={COR.texto} fundo="#121513"
        />
      </Tela>

      <Tela
        arquivo="painel/campanhas.png" janela={T.campanhas}
        zoomDe={1.0} zoomPara={1.03} focoY={-1}
      />

      <Tela arquivo="painel/frota.png" janela={T.frota} zoomDe={1.03} zoomPara={1.0} focoY={0} />

      <Tela arquivo="painel/testar.png" janela={T.testar} zoomDe={1.0} zoomPara={1.03} focoY={2}>
        {/* As quatro barras crescem por varredura: não são redesenhadas, são
            descobertas da esquerda para a direita. */}
        <Varredura x={537} y={188} w={896} h={146} inicio={T.testar[0] + 34} duracao={44} />
      </Tela>

      <Tela arquivo="painel/hora.png" janela={T.hora} zoomDe={1.03} zoomPara={1.0} focoY={-2}>
        <Varredura x={537} y={152} w={896} h={166} inicio={T.hora[0] + 18} duracao={34} />
      </Tela>

      <CursorNoAviso frame={frame} />

      <Pergunta janela={T.pergunta1} texto="O aparelho está ligado?" primeira />
      <Pergunta janela={T.pergunta2} texto="Está com a campanha certa?" />
      <Pergunta janela={T.pergunta3} texto="Qual recurso o cliente mais procura?" />

      <Fecho frame={frame} />
    </AbsoluteFill>
  );
};

/**
 * Uma tela do painel: entra em faixas, a câmera avança e assenta, e ela sai.
 *
 * ── Por que a câmera para depois de dois segundos ─────────────────────────
 * Legibilidade: ninguém lê uma tabela que está andando.
 *
 * E tamanho de arquivo: zoom contínuo sobre captura de tela é o pior caso do
 * H.264 — todo pixel muda em todo quadro e nada é reaproveitado. Medido nesta
 * peça, no mesmo `crf 20`:
 *
 *     movimento até o fim   8,20 MB
 *     câmera assentando     3,72 MB   ← mesma qualidade, metade do arquivo
 *
 * Não foi compressão mais agressiva: foi parar de mexer no que não precisava
 * se mexer.
 */
function Tela({
  arquivo,
  janela,
  zoomDe,
  zoomPara,
  focoY,
  children,
}: {
  arquivo: string;
  janela: readonly [number, number] | number[];
  zoomDe: number;
  zoomPara: number;
  /** Deslocamento vertical em %, para a câmera não ficar sempre no centro. */
  focoY: number;
  /**
   * Destaques desenhados por cima — contador, varredura.
   *
   * Ficam dentro do mesmo contêiner transformado da imagem de propósito. Numa
   * tentativa anterior estavam soltos no quadro, em coordenada fixa: como a
   * captura tem zoom, os dois se separavam e o contador aparecia ao lado do
   * número que devia estar cobrindo.
   */
  children?: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const [ini, fim] = janela as [number, number];
  if (frame < ini - 4 || frame > fim + 4) return null;

  const escala = interpolate(frame, [ini, ini + ASSENTA], [zoomDe, zoomPara], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.22, 1, 0.3, 1),
  });
  const deslocaY = interpolate(frame, [ini, ini + ASSENTA], [0, focoY], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.22, 1, 0.3, 1),
  });

  /* A saída sobe e desbota junto, e a tela seguinte já está entrando por
     baixo: o conjunto lê como uma pilha andando, não como duas fotos
     trocando de lugar. */
  const saida = interpolate(frame, [fim - 16, fim], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 1, 1),
  });

  return (
    <AbsoluteFill style={{ opacity: 1 - saida, translate: `0px ${-saida * 34}px` }}>
      <TelaQueAssenta arquivo={arquivo} inicio={ini} escala={escala} deslocaY={deslocaY}>
        {children}
      </TelaQueAssenta>
    </AbsoluteFill>
  );
}

/**
 * O cursor indo até o aviso de aparelho caído, na visão geral.
 *
 * É o que transforma "tela bonita" em "alguém operando". A viagem desacelera
 * na chegada, como mão humana: velocidade constante lê como robô.
 *
 * As coordenadas são do quadro de 1760×990 e miram o cartão da Loja Centro.
 * Refez a captura e o layout mudou? Precisam ser reconferidas.
 */
function CursorNoAviso({ frame }: { frame: number }) {
  const ini = 200;
  const fim = 262;
  if (frame < ini - 34 || frame > fim + 16) return null;

  const p = interpolate(frame, [ini - 34, ini], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRADA,
  });

  return (
    <Cursor
      x={interpolate(p, [0, 1], [1240, 620])}
      y={interpolate(p, [0, 1], [860, 336])}
      clicando={interpolate(frame, [ini + 4, ini + 30], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })}
      opacidade={
        interpolate(frame, [ini - 34, ini - 26], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }) *
        interpolate(frame, [fim, fim + 14], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      }
    />
  );
}

/** O fecho: a marca entra, o endereço vem atrás, e tudo volta ao preto. */
function Fecho({ frame }: { frame: number }) {
  if (frame < T.fecho[0]) return null;

  const fundo = interpolate(frame, [T.fecho[0], T.fecho[0] + 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const marca = interpolate(frame, [T.fecho[0] + 12, T.fecho[0] + 44], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRADA,
  });
  const endereco = interpolate(frame, [T.fecho[0] + 28, T.fecho[0] + 56], [0, 1], {
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
        opacity: fundo,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 30,
          opacity: sai,
        }}
      >
        <div
          style={{
            opacity: marca,
            translate: `0px ${(1 - marca) * 18}px`,
            scale: 0.96 + marca * 0.04,
          }}
        >
          <LinkaLogo altura={118} />
        </div>
        <span
          style={{
            fontFamily: PILHA_DE_FONTE,
            fontSize: 26,
            color: COR.fraco,
            opacity: endereco,
            translate: `0px ${(1 - endereco) * 12}px`,
          }}
        >
          linkaretail.com.br
        </span>
      </div>
    </AbsoluteFill>
  );
}
