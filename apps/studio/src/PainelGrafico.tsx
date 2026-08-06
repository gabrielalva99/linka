import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from "remotion";
import { COR, PILHA_DE_FONTE } from "./marca";
import { CENA, ENTRA, ESTALO, SAI } from "./curvas";
import { CartaoDados, CartaoFrota, CartaoPublicar } from "./painel/cartoes";
import { LinkaLogo } from "./painel/LinkaLogo";
import { quadrosDe, revelaEm } from "./painel/Pergunta";
import { ChaveDeCamera, Fundo } from "./grafico/Fundo";
import { PerguntaGrafica } from "./grafico/PerguntaGrafica";

/**
 * A peça de venda da LINKA — versão gráfica, sem imagem de loja.
 *
 * ── O que muda em relação à `PainelEmMovimento` ───────────────────────────
 * Mesmo roteiro, mesmas perguntas, mesmos cartões, mesmo relógio. O que sai é
 * a imagem de loja; o que entra é a rede da LINKA como fundo — e ela não é um
 * papel de parede animado, é a topologia do produto (lojas, aparelhos, o
 * caminho por onde a campanha viaja).
 *
 * ── A diferença estrutural ────────────────────────────────────────────────
 * Lá cada cena carrega o próprio fundo, então toda troca de cena é um corte —
 * escondido pela cortina de 82% da pergunta. Aqui existe UM fundo só, na raiz,
 * que nunca é desmontado nos 59 segundos. As cenas contêm apenas os cartões.
 *
 * Consequências, todas boas:
 *   · nenhum corte para esconder → a cortina vira TROCA DE FOCO, e o fundo
 *     continua vivo e legível por trás do texto da pergunta
 *   · a câmera é contínua: ela passeia pela rede, não pula entre planos
 *   · o cartão precisa SAIR (`saidaEm`) em vez de ser coberto — e sair é
 *     sempre melhor do que ser tapado
 *
 * ── Continua valendo ──────────────────────────────────────────────────────
 * `useCurrentFrame()` dentro de uma `<Sequence>` é LOCAL. Tudo que entra numa
 * cena passa por `relativo()`. Foi o bug que fez o cartão de texto nunca
 * animar na versão anterior.
 *
 * ── A regra do dado ───────────────────────────────────────────────────────
 * Interface real com dado de exemplo: sim. Número de RESULTADO: não. Nenhum
 * percentual, comparação ou seta de crescimento em lugar nenhum.
 */

const Q1 = "O aparelho está ligado?";
const Q2 = "Está com a campanha certa?";
const Q3 = "Qual recurso o cliente mais procura?";

/** Onde cada pergunta começa. As janelas nascem do texto, não da mão. */
const P1 = 92;
const P2 = 372;
const P3 = 704;

/* ── o relógio do fecho de argumento ──────────────────────────────────────────
 *
 * ── Por que a janela desta cena é DERIVADA, e não escrita na mão ──────────
 * Porque escrita na mão deu errado. A cena tinha 218 quadros cravados e a
 * saída começava em `duracao - 40` = 178 — mas a última linha só terminava de
 * pousar no quadro 184. **O bloco começava a sair seis quadros ANTES de a
 * frase mais importante da peça acabar de aparecer**, e ela nunca chegava a
 * 100% de opacidade. Dava para ver que havia texto; não dava para ler.
 *
 * É exatamente o erro que `quadrosDe()` existe para impedir nas perguntas —
 * eu criei a proteção lá e escrevi o número na mão aqui.
 *
 * Agora a janela nasce do texto: mexeu nas frases, o tempo se ajusta sozinho.
 *
 * ── Por que este bloco mora aqui em cima, longe do componente ─────────────
 * Porque a LINHA DO TEMPO da composição depende dele. `quadrosDoAcompanha()`
 * roda na montagem do módulo, e uma `const` declarada mais abaixo ainda não
 * existe nessa hora — "Cannot access before initialization", que foi o que
 * aconteceu na primeira tentativa. Declaração de função sobe; `const` não.
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * As três linhas são AFIRMAÇÃO DE PRODUTO e todas são verdade hoje. Mexer aqui
 * é mexer numa promessa comercial, não num texto de tela.
 */
const LINHAS = [
  "cada aparelho, em cada loja, agora",
  "a campanha que está no ar, e onde ela chegou",
  "quem pegou, por quanto tempo, e o que quis testar",
];

const PRIMEIRA_LINHA = 50;
const RAMPA_DA_LINHA = 26;
/**
 * Quanto tempo a última linha fica inteira e parada antes de o bloco sair.
 *
 * Ela tem 10 palavras e 48 caracteres — é a frase mais longa da peça. As duas
 * de cima CONTINUAM na tela enquanto ela entra, então elas se leem com folga;
 * só a última tem prazo, porque a saída do bloco vem logo atrás dela. É por
 * isso que o número que importa aqui é este, e não o intervalo entre linhas.
 */
const SEGURA = 70;
const RAMPA_DA_SAIDA = 34;
/** Intervalo entre a saída de uma linha e a da seguinte. */
const PASSO_DA_SAIDA = 7;

/** Em que quadro cada linha começa a entrar. O intervalo nasce da leitura. */
function entradasDasLinhas() {
  const entradas: number[] = [];
  let quando = PRIMEIRA_LINHA;
  for (const l of LINHAS) {
    entradas.push(quando);
    /* ~4 quadros por palavra: não se escalona texto mais rápido do que ele é
       lido, senão o olho é puxado para o movimento novo no meio da leitura. */
    quando += RAMPA_DA_LINHA + l.split(/\s+/).length * 4;
  }
  return entradas;
}

/** Quadro em que a última linha termina de pousar. */
function ultimaPousa() {
  const e = entradasDasLinhas();
  return e[e.length - 1] + RAMPA_DA_LINHA;
}

/** Quadro em que o bloco começa a sair. */
function saiEm() {
  return ultimaPousa() + SEGURA;
}

/** Quantos quadros esta cena precisa. A janela nasce do texto. */
export function quadrosDoAcompanha() {
  return saiEm() + (LINHAS.length - 1) * PASSO_DA_SAIDA + RAMPA_DA_SAIDA;
}

const ACOMPANHA_DE = 1044;
const ACOMPANHA_ATE = ACOMPANHA_DE + quadrosDoAcompanha();
/** O colapso da rede começa enquanto o texto ainda está saindo. */
const FECHO_DE = ACOMPANHA_ATE - 22;
const FECHO_DURA = 142;

export const DURACAO_GRAFICA = FECHO_DE + FECHO_DURA;

const T = {
  pergunta1: [P1, P1 + quadrosDe(Q1)],
  pergunta2: [P2, P2 + quadrosDe(Q2)],
  pergunta3: [P3, P3 + quadrosDe(Q3)],

  frota: [104, 404],
  publicar: [386, 736],
  dados: [718, 1068],

  acompanha: [ACOMPANHA_DE, ACOMPANHA_ATE],
  fecho: [FECHO_DE, DURACAO_GRAFICA],
} as const;

/**
 * A câmera.
 *
 * Ela é contínua e não conhece cenas — por isso os keyframes são em quadros da
 * COMPOSIÇÃO. A regra por trás dos valores: quando um cartão manda na tela, a
 * câmera FECHA (menos nós, maiores, atrás do vidro — menos concorrência). Na
 * hora da onda de publicação ela ABRE, porque aí o fundo é o assunto.
 */
const CAMERA: ChaveDeCamera[] = [
  { f: 0, escala: 1.16, x: -40, y: 34 },
  { f: 140, escala: 1.04, x: 20, y: 8 },
  { f: 262, escala: 1.2, x: -70, y: -30 },
  { f: 400, escala: 1.27, x: -112, y: -52 },
  { f: 476, escala: 1.0, x: 0, y: 0 },
  { f: 700, escala: 1.06, x: 44, y: 22 },
  { f: 836, escala: 1.18, x: 92, y: -28 },
  { f: 1014, escala: 1.25, x: 132, y: -48 },
  { f: 1068, escala: 1.08, x: 300, y: -10 },
  { f: FECHO_DE - 2, escala: 1.02, x: 344, y: 6 },
  /* O retorno ao centro acontece DURANTE o colapso: a rede não pode terminar
     de se contrair fora do lugar onde a marca vai pousar. */
  { f: FECHO_DE + 56, escala: 1.14, x: 0, y: 0 },
  { f: DURACAO_GRAFICA, escala: 1.2, x: 0, y: 0 },
];

/** Luminosidade da rede. Cai quando um cartão manda, sobe quando o fundo fala. */
const LUZ: [number, number][] = [
  [0, 0.4],
  [96, 1.0],
  [196, 0.72],
  [430, 0.74],
  [504, 1.0],
  [700, 0.78],
  [826, 0.66],
  [1032, 0.92],
  [1130, 0.95],
  /* A luz só cai DEPOIS do colapso. Se cair antes, a rede se apaga em vez de
     se recolher — e o gesto do fecho some. */
  [FECHO_DE - 2, 0.62],
  [FECHO_DE + 54, 0.5],
  [DURACAO_GRAFICA, 0.22],
];

export const PainelGrafico: React.FC = () => {
  return (
    <AbsoluteFill name="LINKA · gráfico" style={{ background: COR.fundo }}>
      {/* UM fundo, do primeiro ao último quadro. Nunca desmonta. */}
      <Fundo
        camera={CAMERA}
        luz={LUZ}
        formacao={88}
        /* A onda parte no quadro em que o botão "Publicar" vira "No ar em 8
           segundos" — o fundo responde ao que a interface acabou de fazer. */
        onda={[582, 740]}
        /* Os dois aparelhos apagados ficam vermelhos enquanto o aviso do
           cartão da frota está no ar. A mesma informação, nas duas camadas. */
        falhas={[268, 372]}
        convergencia={[FECHO_DE, FECHO_DE + 54]}
      />

      {/* "O aparelho está ligado?" → a frota, linha a linha, e o aviso */}
      <Cena janela={T.frota}>
        <CartaoFrota
          moldura={12}
          conteudo={relativo(P1 + revelaEm(Q1), T.frota)}
          duracao={dur(T.frota)}
          saidaEm={dur(T.frota) - 48}
          ancorado
        />
      </Cena>

      {/* "Está com a campanha certa?" → publicar em 8 lojas, 96 aparelhos */}
      <Cena janela={T.publicar}>
        <CartaoPublicar
          moldura={12}
          conteudo={relativo(P2 + revelaEm(Q2), T.publicar)}
          duracao={dur(T.publicar)}
          saidaEm={dur(T.publicar) - 50}
          ancorado
        />
      </Cena>

      {/* "Qual recurso o cliente mais procura?" → as barras e as horas */}
      <Cena janela={T.dados}>
        <CartaoDados
          moldura={12}
          conteudo={relativo(P3 + revelaEm(Q3), T.dados)}
          duracao={dur(T.dados)}
          saidaEm={dur(T.dados) - 58}
          ancorado
        />
      </Cena>

      {/* o que a marca passa a acompanhar */}
      <Sequence from={T.acompanha[0]} durationInFrames={dur(T.acompanha) + 1} layout="none">
        <Acompanha duracao={dur(T.acompanha)} />
      </Sequence>

      {/* As perguntas ficam por cima dos cartões: elas são o foco e o texto. */}
      <PerguntaGrafica janela={T.pergunta1} texto={Q1} indice={1} />
      <PerguntaGrafica janela={T.pergunta2} texto={Q2} indice={2} />
      <PerguntaGrafica janela={T.pergunta3} texto={Q3} indice={3} />

      <Sequence from={T.fecho[0]} durationInFrames={dur(T.fecho) + 1} layout="none">
        <Fecho duracao={dur(T.fecho)} />
      </Sequence>
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
 * Uma cena de cartão.
 *
 * Sem fade de cena: quem entra e quem sai é o cartão, pelo próprio movimento
 * (`moldura` e `saidaEm`). Fade de contêiner por cima de um elemento que já
 * tem entrada própria dá opacidade multiplicada — foi o que fez a saída "de 26
 * quadros" acontecer em 8 numa versão anterior.
 */
function Cena({
  janela,
  children,
}: {
  janela: readonly [number, number] | number[];
  children: React.ReactNode;
}) {
  const [ini, fim] = janela as [number, number];
  return (
    <Sequence from={ini} durationInFrames={fim - ini + 1} layout="none">
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        {children}
      </AbsoluteFill>
    </Sequence>
  );
}

/* ── o que a marca passa a acompanhar ─────────────────────────────────────── */

/**
 * O tratamento gráfico do fecho de argumento. O RELÓGIO dele está lá no alto
 * do arquivo, junto com `LINHAS` — ver o comentário de `SEGURA`.
 *
 * O bloco vive à esquerda e a rede fica à direita (a câmera empurra a rede
 * para lá justamente aqui). Um trilho vertical desce ligando os três marcadores
 * — é a mesma linguagem dos elos da rede, aplicada ao texto: o que está sendo
 * dito e o que está no fundo são a mesma coisa.
 *
 * O escalonamento é por TEMPO DE LEITURA, não constante: o intervalo entre uma
 * linha e a outra nasce do tamanho da frase. Escalonar texto mais rápido do que
 * ele é lido puxa o olho para o movimento novo antes de a leitura terminar.
 */
function Acompanha({ duracao }: { duracao: number }) {
  const frame = useCurrentFrame();

  const entrada = interpolate(frame, [0, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: CENA,
  });
  /* O contêiner sai junto com a ÚLTIMA linha, não antes dela. */
  const saida = interpolate(frame, [saiEm(), duracao], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: SAI,
  });

  const titulo = interpolate(frame, [12, 44], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRA,
  });

  const entradas = entradasDasLinhas();
  const ultima = ultimaPousa();

  /** O trilho desce acompanhando as linhas, e para quando a última pousa. */
  const trilho = interpolate(frame, [entradas[0] - 6, ultima], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: CENA,
  });

  return (
    <AbsoluteFill style={{ opacity: saida }}>
      {/* Véu só do lado do texto: escurece o bastante para a leitura sem
          apagar a rede, que continua trabalhando à direita. */}
      <AbsoluteFill
        style={{
          /* O véu abre mais cedo do lado direito de propósito. A varredura
             mostrou 1,3 s sem nada em movimento entre a segunda e a terceira
             linha; a rede é o que preenche essa pausa, e ela precisa estar
             visível para isso. À esquerda, onde o texto vive, continua opaco. */
          background: `linear-gradient(94deg, ${COR.fundo} 0%, ${COR.fundo}f0 48%, ${COR.fundo}82 72%, transparent 92%)`,
          opacity: entrada,
        }}
      />
      <AbsoluteFill style={{ alignItems: "flex-start", justifyContent: "center", padding: "0 0 0 140px" }}>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 40, width: 1420 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 22,
              opacity: titulo,
              translate: `0px ${(1 - titulo) * 26}px`,
            }}
          >
            <span style={{ width: 48 * titulo, height: 4, background: COR.verde, borderRadius: 2 }} />
            <span
              style={{
                fontFamily: PILHA_DE_FONTE,
                fontSize: 66,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: COR.texto,
              }}
            >
              No LINKA você acompanha
            </span>
          </div>

          <div style={{ position: "relative", paddingLeft: 70 }}>
            {/* O trilho, na mesma linguagem dos elos da rede — e com a mesma
                luz correndo por dentro.

                O gradiente é um ladrilho de 260 px que desce em laço. Isso
                resolve os dois trechos mais parados desta cena: entre uma linha
                e a outra existe uma pausa de leitura de mais de um segundo em
                que, sem isto, nada na metade esquerda do quadro se mexia. */}
            <span
              style={{
                position: "absolute",
                left: 74,
                top: 14,
                width: 2,
                height: `calc(${trilho * 100}% - ${trilho * 28}px)`,
                background: `linear-gradient(180deg, ${COR.verde}1c 0%, ${COR.verde} 42%, ${COR.verde}1c 84%)`,
                backgroundSize: "100% 260px",
                backgroundRepeat: "repeat-y",
                backgroundPositionY: `${(frame * 2.2) % 260}px`,
                opacity: 0.55,
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
              {LINHAS.map((linha, i) => {
                const p = interpolate(frame, [entradas[i], entradas[i] + RAMPA_DA_LINHA], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: ENTRA,
                });
                /* Saem na mesma ordem em que entraram, com poucos quadros
                   entre uma e outra — então a ÚLTIMA a deixar a tela é a
                   afirmação mais forte das três, e não a primeira. */
                const saiEsta = saiEm() + i * PASSO_DA_SAIDA;
                const s = interpolate(frame, [saiEsta, saiEsta + RAMPA_DA_SAIDA], [1, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: SAI,
                });
                /** O marcador estala depois de a linha assentar. */
                const marca = interpolate(frame, [entradas[i] + 12, entradas[i] + 30], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: ESTALO,
                });
                return (
                  <div
                    key={linha}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 26,
                      opacity: p * s,
                      translate: `${(1 - p) * -34}px 0px`,
                    }}
                  >
                    {/* O marcador é um nó da rede, e nó da rede respira. Fora
                        de fase entre os três: se pulsarem juntos vira
                        pisca-pisca, e o que se quer é presença. */}
                    <span
                      style={{
                        position: "relative",
                        width: 12,
                        height: 12,
                        borderRadius: 999,
                        background: COR.verde,
                        flexShrink: 0,
                        scale: (0.3 + marca * 0.7) * (1 + Math.sin(frame / 46 + i * 2.1) * 0.13),
                        boxShadow: `0 0 ${(15 + 9 * Math.sin(frame / 46 + i * 2.1)) * marca}px ${COR.verde}`,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: PILHA_DE_FONTE,
                        fontSize: 40,
                        color: COR.verdeClaro,
                        letterSpacing: "-0.01em",
                        /* Sem isto a terceira linha quebra em duas e o bloco
                           inteiro se desalinha. Se um dia o texto crescer, é
                           melhor estourar a caixa (visível) do que quebrar em
                           silêncio (passa despercebido até estar no ar). */
                        whiteSpace: "nowrap",
                      }}
                    >
                      {linha}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/* ── o fecho ──────────────────────────────────────────────────────────────── */

/**
 * O fecho.
 *
 * A rede inteira se contrai para dentro da marca — quem faz isso é o `Fundo`,
 * pela janela de `convergencia`. Aqui só entra o que pousa por cima.
 *
 * ── A marca precisa de tempo de tela ──────────────────────────────────────
 * Numa versão anterior o logotipo ficava nítido por 0,24 s e o endereço nunca
 * chegava a 100% — a saída já o puxava durante a própria entrada. Numa peça
 * que roda em laço, o cartão final é a carga útil.
 *
 * ── E a emenda do laço ────────────────────────────────────────────────────
 * A peça NÃO termina em preto absoluto e NÃO desbota no fim. O último quadro é
 * a marca sobre a rede contraída, e o laço corta dali para a rede se formando —
 * duas imagens parentes. Numa peça em laço a emenda é o momento mais visto.
 */
function Fecho({ duracao }: { duracao: number }) {
  const frame = useCurrentFrame();

  /* A rede termina de colapsar no quadro 54 (`convergencia` no `Fundo`). Tudo
     aqui está ancorado nesse instante: o clarão nele, a marca saindo de dentro
     dele. Se a marca entrar antes, ela compete com o colapso em vez de ser o
     resultado dele. */
  const IMPACTO = 54;

  const marca = interpolate(frame, [IMPACTO - 8, IMPACTO + 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ESTALO,
  });
  const endereco = interpolate(frame, [IMPACTO + 24, IMPACTO + 52], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRA,
  });
  /**
   * Assentamento: pousa passando um triz, volta, e PARA.
   *
   * Chegou a ter um seno permanente por baixo, para o fim nunca congelar. Era
   * a solução errada para um problema real: escala fracionária contínua em
   * cima de "linkaretail.com.br" faz o endereço ferver, e o cartão final é
   * onde o espectador mais olha. Quem impede o congelamento é o fundo — o
   * brilho passeia e as partículas sobem, e nenhum dos dois é texto.
   *
   * A cauda do pouso é CURTA de propósito. A primeira tentativa levava 32
   * quadros para ir de 1,018 a 1,0 — devagar demais para ler como movimento e
   * rápido demais para não re-rasterizar: "linkaretail.com.br" rastejava por
   * dois segundos e meio. Agora a marca assenta em 16 quadros e para.
   *
   * A partir de IMPACTO+46 o valor é exatamente 1,0 e não muda mais.
   */
  const respira = interpolate(
    frame,
    [IMPACTO - 8, IMPACTO + 26, IMPACTO + 46],
    [0.96, 1.018, 1.0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: CENA },
  );
  /** O clarão do instante em que a rede termina de colapsar na marca. */
  const clarao = Math.max(0, 1 - Math.abs(frame - IMPACTO) / 18);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(42% 46% at 50% 50%, ${COR.verde}26 0%, transparent 70%)`,
          opacity: clarao,
        }}
      />
      {/* Duas ondulações rápidas saindo da marca — o eco da onda de publicação.
          Um anel só, e lento, não lê como pulso: lê como moldura em volta do
          logotipo, que foi o que aconteceu na primeira tentativa. */}
      <Ondulacao frame={frame} de={IMPACTO - 4} />
      <Ondulacao frame={frame} de={IMPACTO + 13} />
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
        <div
          style={{
            opacity: marca,
            translate: `0px ${(1 - marca) * 24}px`,
            /* Mesma regra do cartão: assentado, nada de caminho de filtro. */
            filter: marca >= 1 ? undefined : `blur(${(1 - marca) * 8}px)`,
          }}
        >
          <LinkaLogo altura={132} />
        </div>
        <span
          style={{
            fontFamily: PILHA_DE_FONTE,
            fontSize: 30,
            letterSpacing: "0.06em",
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

/**
 * Uma ondulação: 34 quadros para fora, apagando conforme abre.
 *
 * Ela NASCE FORA da caixa do logotipo (raio inicial 300, contra ~250 de
 * meia-largura da marca). Nascendo do centro, a circunferência atravessava as
 * letras e aparecia no vão entre "LIN" e "KA" como um risco verde em cima da
 * marca — parecia defeito de renderização, não onda.
 */
const RAIO_LIVRE = 300;

function Ondulacao({ frame, de }: { frame: number; de: number }) {
  const t = interpolate(frame, [de, de + 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: CENA,
  });
  if (t <= 0 || t >= 1) return null;
  /* Nasce fora da marca, então precisa aparecer em vez de surgir pronta. */
  const nasce = Math.min(1, t / 0.14);
  /* Fraca de propósito. Uma circunferência nítida em volta de um logotipo lê
     como anel de carregamento; o que se quer aqui é o eco da onda, no limite
     do perceptível. */
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
      <circle
        cx={960}
        cy={540}
        r={RAIO_LIVRE + t * 780}
        fill="none"
        stroke={COR.verde}
        strokeWidth={2}
        opacity={nasce * Math.pow(1 - t, 2.2) * 0.17}
      />
    </svg>
  );
}
