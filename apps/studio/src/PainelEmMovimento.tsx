import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from "remotion";
import { COR, PILHA_DE_FONTE } from "./marca";
import { CENA, ENTRA, ESTALO } from "./curvas";
import { CartaoDados, CartaoFrota, CartaoPublicar } from "./painel/cartoes";
import { LinkaLogo } from "./painel/LinkaLogo";
import { Loja } from "./painel/Loja";
import { Pergunta, quadrosDe, revelaEm } from "./painel/Pergunta";

/**
 * A peça de venda da LINKA — a loja e o painel, no mesmo quadro.
 *
 * ── A ideia ───────────────────────────────────────────────────────────────
 * Imagem de loja ao fundo; o painel flutuando por cima. Não é ilustração do
 * argumento, é o argumento: o H1 da página diz que "a loja física gera dado a
 * cada toque", e aqui o toque e o dado dividem a tela.
 *
 * ── A regra que organiza tudo aqui: MOLDURA ≠ CONTEÚDO ────────────────────
 * O cartão aparece cedo, debaixo da cortina da pergunta, para a tela não
 * ficar vazia. Mas ele só COMEÇA A ANIMAR quando a cortina levanta.
 *
 * Numa versão anterior os dois eram a mesma coisa, e esse era o pior defeito
 * da peça: as linhas da frota entrando, as oito lojas sendo marcadas, o
 * contador subindo, as barras crescendo — o melhor do produto rodava a 18% de
 * visibilidade. A cortina levantava num cartão já montado, que depois ficava
 * parado dois a quatro segundos. Ninguém via a ação, só a espera. É isso que
 * fazia a peça parecer corrida e arrastada ao mesmo tempo.
 *
 * `revelaEm(texto)` calcula esse instante a partir da própria frase.
 *
 * ── ATENÇÃO: dentro de uma `<Sequence>` o relógio é LOCAL ─────────────────
 * `useCurrentFrame()` devolve o quadro contado a partir do início da cena, não
 * o da composição. Então tudo que é passado para dentro de uma cena precisa
 * ser RELATIVO a ela — é o que `relativo()` faz aqui. Passar quadro absoluto
 * atrasa a animação pelo tamanho do deslocamento da cena, e no caso do cartão
 * de texto (que começava no 890) ela simplesmente nunca acontecia.
 *
 * ── Cada cena vive numa `<Sequence>` ──────────────────────────────────────
 * Sem isso o cabeçote do vídeo segue o quadro da COMPOSIÇÃO, e o `loop` do
 * clipe dava a volta no meio das cenas — um corte seco acidental dentro de
 * cada uma, nos quadros 225, 450 e 675. Com `Sequence` o tempo do vídeo é
 * local. E cada cena usa um plano diferente: antes o mesmo clipe aparecia
 * duas vezes, quase do mesmo ponto, em 33 segundos.
 *
 * ── Nada de platô ─────────────────────────────────────────────────────────
 * As três batidas tinham o mesmo tamanho, a mesma cobertura de cortina e o
 * mesmo brilho. Três batidas iguais não são ritmo, são compasso. Agora as
 * janelas crescem conforme a peça entrega mais, a cortina clareia (0,86 →
 * 0,80 → 0,74) e o brilho da loja sobe — o filme progride em vez de repetir.
 *
 * ── A regra do dado ───────────────────────────────────────────────────────
 * Interface real com dado de exemplo: sim. Número de RESULTADO: não. Nenhum
 * percentual, comparação ou seta de crescimento em lugar nenhum.
 */

const Q1 = "O aparelho está ligado?";
const Q2 = "Está com a campanha certa?";
const Q3 = "Qual recurso o cliente mais procura?";

/** Quadros de desbotamento na entrada de cada cena. */
const ENTRADA = 18;

/**
 * A linha do tempo, em quadros de 25 fps.
 *
 * Cada cena termina DEPOIS que a próxima já cobriu a tela — se as janelas
 * apenas se encostarem, sobra um quadro sem cena nenhuma, preto puro piscando
 * no meio do vídeo. Aconteceu, nos quadros 273 e 453.
 */
const P1 = 30;
const P2 = 278;
const P3 = 583;

const T = {
  pergunta1: [P1, P1 + quadrosDe(Q1)],
  pergunta2: [P2, P2 + quadrosDe(Q2)],
  pergunta3: [P3, P3 + quadrosDe(Q3)],

  abertura: [0, 64],
  frota: [44, 312],
  publicar: [292, 617],
  dados: [597, 916],

  acompanha: [890, 1072],
  fecho: [1050, 1160],
} as const;

export const PainelEmMovimento: React.FC = () => {
  return (
    <AbsoluteFill name="LINKA" style={{ background: COR.fundo }}>
      {/* a loja sozinha. É onde o dado nasce, e onde ele se perde hoje. */}
      <Cena janela={T.abertura} entrada={0}>
        <Loja arquivo="loja/tablet.mp4" duracao={dur(T.abertura)} brilho={0.66} />
      </Cena>

      {/* "O aparelho está ligado?" → a frota, linha a linha, e o aviso */}
      <Cena janela={T.frota} entrada={ENTRADA}>
        <Loja arquivo="loja/bancada.mp4" duracao={dur(T.frota)} brilho={0.58} />
        <Centro>
          <CartaoFrota
            moldura={12}
            conteudo={relativo(P1 + revelaEm(Q1), T.frota)}
            duracao={dur(T.frota)}
          />
        </Centro>
      </Cena>

      {/* "Está com a campanha certa?" → publicar em 8 lojas, 96 aparelhos */}
      <Cena janela={T.publicar} entrada={ENTRADA}>
        <Loja arquivo="loja/vitrine.mp4" duracao={dur(T.publicar)} brilho={0.62} />
        <Centro>
          <CartaoPublicar
            moldura={12}
            conteudo={relativo(P2 + revelaEm(Q2), T.publicar)}
            duracao={dur(T.publicar)}
          />
        </Centro>
      </Cena>

      {/* "Qual recurso o cliente mais procura?" → as barras e as horas */}
      <Cena janela={T.dados} entrada={ENTRADA}>
        <Loja arquivo="loja/balcao.mp4" duracao={dur(T.dados)} brilho={0.66} />
        <Centro>
          <CartaoDados
            moldura={12}
            conteudo={relativo(P3 + revelaEm(Q3), T.dados)}
            duracao={dur(T.dados)}
          />
        </Centro>
      </Cena>

      {/* o que a marca passa a acompanhar */}
      <Cena janela={T.acompanha} entrada={24}>
        <Loja
          arquivo="loja/tablet.mp4"
          duracao={dur(T.acompanha)}
          deInicio={5}
          brilho={0.34}
          zoomDe={1.1}
          zoomPara={1.16}
        />
        <Acompanha inicio={0} />
      </Cena>

      {/* As perguntas ficam por cima de tudo: elas são a cortina e o texto. */}
      {/* o fecho tem a própria cena, com a loja quase apagada por trás — é o
          que impede o fim de congelar e o que costura a emenda do laço */}
      <Cena janela={T.fecho} entrada={0}>
        <Loja
          arquivo="loja/vitrine.mp4"
          duracao={dur(T.fecho)}
          deInicio={9}
          brilho={0.2}
          zoomDe={1.14}
          zoomPara={1.06}
        />
      </Cena>

      <Pergunta janela={T.pergunta1} texto={Q1} cobertura={0.86} />
      <Pergunta janela={T.pergunta2} texto={Q2} cobertura={0.8} />
      <Pergunta janela={T.pergunta3} texto={Q3} cobertura={0.74} />

      <Fecho />
    </AbsoluteFill>
  );
};

function dur(j: readonly [number, number] | number[]) {
  const [a, b] = j as [number, number];
  return b - a;
}

/** Converte um quadro da composição para o relógio local de uma cena. */
function relativo(absoluto: number, cena: readonly [number, number] | number[]) {
  return absoluto - (cena as [number, number])[0];
}

/**
 * Um trecho da peça, dentro de uma `<Sequence>` para o tempo do vídeo ser
 * local à cena.
 *
 * A cena NUNCA desbota na saída: fica opaca até o último quadro e só então
 * some — e a essa altura a de cima já cobriu a tela inteira. Fade existe só na
 * ENTRADA, sempre por cima de algo opaco. Duas camadas em meia opacidade
 * sobre o preto não somam uma; meia opacidade sobre uma camada cheia soma.
 */
function Cena({
  janela,
  entrada,
  children,
}: {
  janela: readonly [number, number] | number[];
  entrada: number;
  children: React.ReactNode;
}) {
  const [ini, fim] = janela as [number, number];
  return (
    <Sequence from={ini} durationInFrames={fim - ini + 1} layout="none">
      <Desbota entrada={entrada}>{children}</Desbota>
    </Sequence>
  );
}

function Desbota({ entrada, children }: { entrada: number; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  if (entrada === 0) return <AbsoluteFill>{children}</AbsoluteFill>;
  return (
    <AbsoluteFill
      style={{
        opacity: interpolate(frame, [0, entrada], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: CENA,
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
 * ── Por que a loja continua atrás, e escura ───────────────────────────────
 * Já foi preto sólido, e o preto sólido congelava: entre uma linha e a outra
 * não havia UM pixel mudando na tela. A varredura pegou 152 quadros idênticos
 * exatamente aqui. Num cartão de texto, o fundo é o que mantém a peça viva.
 *
 * Fica em 34% de brilho, mais um véu atrás do bloco de texto — escuro o
 * bastante para o texto mandar, vivo o bastante para nada congelar.
 *
 * ── O escalonamento é por tempo de leitura, não constante ─────────────────
 * As três linhas tinham 13 quadros de intervalo, menor que a rampa de 24 — a
 * linha seguinte começava antes de a anterior terminar, e o olho era puxado
 * para o movimento novo antes de acabar de ler. Não se escalona texto mais
 * rápido do que ele é lido. Agora o intervalo nasce do tamanho da frase.
 *
 * As três linhas são AFIRMAÇÃO DE PRODUTO e todas são verdade hoje. Mexer
 * aqui é mexer numa promessa comercial, não num texto de tela.
 */
const LINHAS = [
  "cada aparelho, em cada loja, agora",
  "a campanha que está no ar, e onde ela chegou",
  "quem pegou, por quanto tempo, e o que quis testar",
];

function Acompanha({ inicio }: { inicio: number }) {
  const frame = useCurrentFrame();

  const titulo = interpolate(frame, [inicio + 10, inicio + 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRA,
  });

  /** ~4 quadros por palavra: o intervalo nasce do que há para ler. */
  const entradas: number[] = [];
  let quando = inicio + 44;
  for (const l of LINHAS) {
    entradas.push(quando);
    quando += 26 + l.split(/\s+/).length * 4;
  }

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {/* Véu só atrás do texto: escurece o suficiente para a leitura sem
          apagar a imagem inteira. */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(90deg, ${COR.fundo} 0%, ${COR.fundo}f0 62%, ${COR.fundo}55 100%)`,
        }}
      />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 36, width: 1320 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 22,
            opacity: titulo,
            translate: `0px ${(1 - titulo) * 24}px`,
          }}
        >
          <span style={{ width: 48, height: 4, background: COR.verde, borderRadius: 2 }} />
          <span
            style={{
              fontFamily: PILHA_DE_FONTE,
              fontSize: 64,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: COR.texto,
            }}
          >
            No LINKA você acompanha
          </span>
        </div>

        {LINHAS.map((linha, i) => {
          const p = interpolate(frame, [entradas[i], entradas[i] + 26], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ENTRA,
          });
          return (
            <div
              key={linha}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 24,
                paddingLeft: 70,
                opacity: p,
                translate: `${(1 - p) * -30}px 0px`,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: COR.verde,
                  flexShrink: 0,
                  scale: 0.4 + p * 0.6,
                  boxShadow: `0 0 ${16 * p}px ${COR.verde}`,
                }}
              />
              <span
                style={{
                  fontFamily: PILHA_DE_FONTE,
                  fontSize: 42,
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
 * ── A marca precisa de tempo de tela ──────────────────────────────────────
 * Numa versão anterior o logotipo ficava nítido por 0,24 s e o endereço nunca
 * chegava a 100% — a saída já o puxava durante a própria entrada. Numa peça
 * que roda em laço, o cartão final é a carga útil: ele tinha menos tempo de
 * tela que uma linha da tabela de frota.
 *
 * Agora a marca pousa passando um triz e assenta, o endereço vem depois dela
 * ter parado, e os dois ficam de pé até o último quadro.
 *
 * ── E a emenda do laço ────────────────────────────────────────────────────
 * A peça NÃO termina em preto absoluto e NÃO desbota no fim. O último quadro
 * é a marca, e o laço corta dali para a loja. Antes o último quadro era preto
 * puro e o primeiro era loja em brilho cheio: um flash a cada volta. Numa peça
 * em laço a emenda é o momento mais visto do filme.
 */
function Fecho() {
  const frame = useCurrentFrame();
  const [ini, fim] = T.fecho;
  if (frame < ini) return null;

  const fundo = interpolate(frame, [ini, ini + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: CENA,
  });
  const marca = interpolate(frame, [ini + 24, ini + 56], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ESTALO,
  });
  const endereco = interpolate(frame, [ini + 52, ini + 78], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRA,
  });
  /** Assentamento: pousa passando um triz e volta. Não cresce para sempre. */
  const respira = interpolate(frame, [ini + 24, ini + 62, fim], [0.97, 1.015, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: CENA,
  });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {/* escurece o que houver por baixo, sem chegar ao preto absoluto */}
      <AbsoluteFill style={{ background: COR.fundo, opacity: fundo * 0.9 }} />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 46,
          scale: respira,
        }}
      >
        <div style={{ opacity: marca, translate: `0px ${(1 - marca) * 22}px` }}>
          <LinkaLogo altura={128} />
        </div>
        <span
          style={{
            fontFamily: PILHA_DE_FONTE,
            fontSize: 30,
            letterSpacing: "0.04em",
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
