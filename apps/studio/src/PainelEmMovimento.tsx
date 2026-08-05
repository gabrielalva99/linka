import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { COR, PILHA_DE_FONTE } from "./marca";
import { Chrome } from "./painel/Chrome";
import { LinkaLogo } from "./painel/LinkaLogo";
import { Barra, Cursor, ENTRADA, entra, Ponto, Selo } from "./painel/pecas";

/**
 * O painel da LINKA em movimento — peça de venda para a página.
 *
 * ── O que ele conta ───────────────────────────────────────────────────────
 * As TRÊS PERGUNTAS da seção 01 da página, respondidas pelo produto:
 *
 *   "O aparelho está ligado?"              → a frota, com dois apagados e o aviso
 *   "Está com a campanha certa?"           → publicar em 8 lojas, no ar em segundos
 *   "Qual recurso o cliente mais procura?" → visitas por hora e recursos testados
 *
 * Se mudar uma pergunta aqui, MUDE TAMBÉM na seção 01 da página. O encaixe
 * entre as duas é o motivo de o vídeo pertencer ao site; desalinhado, ele vira
 * um vídeo bonito ao lado de um texto que fala outra coisa.
 *
 * Quem leu a página e chega no vídeo vê a mesma pergunta sendo respondida. É
 * isso que faz a peça pertencer ao site em vez de ser um vídeo bonito ao lado.
 *
 * ── A regra do dado ───────────────────────────────────────────────────────
 * Interface com dado de exemplo: sim, é prática normal de produto e o dado é
 * neutro ("Loja Centro", "Bancada 04"). Número de RESULTADO: não. Não há
 * percentual, não há comparação e não há seta de crescimento em lugar nenhum —
 * nem nas barras, nem no gráfico. Esse é o número que a marca cobra na reunião
 * seguinte, e ele não existe ainda.
 *
 * ── Laço ──────────────────────────────────────────────────────────────────
 * Abre no preto e fecha no preto. Pode rodar em `loop` sem emenda.
 */

/** A linha do tempo inteira, em quadros (30 fps · 900 quadros · 30 s). */
const T = {
  pergunta1: [12, 104],
  painelEntra: [96, 132],

  frota: 142,
  aviso: 252,
  cursorNoAviso: [262, 300],

  pergunta2: [322, 402],
  publicacao: 398,
  selecao: [432, 508],
  botaoPublicar: [512, 546],
  noAr: [548, 600],

  pergunta3: [612, 692],
  dados: 688,

  fecho: [832, 900],
} as const;

export const PainelEmMovimento: React.FC = () => {
  const frame = useCurrentFrame();

  /** O painel entra na cena 1 e sai no fecho. */
  const painel = interpolate(
    frame,
    [T.painelEntra[0], T.painelEntra[1], T.fecho[0], T.fecho[0] + 34],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ENTRADA },
  );

  /** Qual conteúdo está no ar dentro da moldura. */
  const aba = frame >= T.dados ? 2 : frame >= T.publicacao ? 1 : 0;
  const titulo =
    aba === 2 ? "Dados · últimos 7 dias" : aba === 1 ? "Conteúdo" : "Frota · 96 aparelhos";

  return (
    <AbsoluteFill name="Painel em movimento" style={{ background: COR.fundo }} from={-69}>
      <Fundo />
      {/* A moldura do painel, contínua da cena 2 à 4. */}
      <div
        style={{
          /* Margem enxuta de propósito. Com folga generosa o painel vira uma
             telinha no meio de uma caixa preta quando o bloco entra na página
             — o quadro tem que ser quase todo produto. */
          position: "absolute",
          left: 92,
          top: 74,
          width: 1736,
          height: 932,
          opacity: painel,
          scale: interpolate(painel, [0, 1], [0.965, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          filter: frame > T.fecho[0] ? `blur(${(1 - painel) * 16}px)` : undefined,
        }}
      >
        <Chrome
          aba={aba}
          titulo={titulo}
          acao={aba === 0 ? <Selo cor={COR.fraco}>Atualizado agora</Selo> : undefined}
        >
          {aba === 0 && <ConteudoFrota frame={frame} />}
          {aba === 1 && <ConteudoPublicacao frame={frame} />}
          {aba === 2 && <ConteudoDados frame={frame} />}
        </Chrome>
      </div>
      <CursorDaCena frame={frame} />
      <Pergunta frame={frame} janela={T.pergunta1} texto="O aparelho está ligado?" sozinha />
      <Pergunta frame={frame} janela={T.pergunta2} texto="Está com a campanha certa?" />
      <Pergunta frame={frame} janela={T.pergunta3} texto="Qual recurso o cliente mais procura?" />
      <Fecho frame={frame} />
    </AbsoluteFill>
  );
};

/* ── cena 1 · a pergunta ─────────────────────────────────────────────────── */

/**
 * A pergunta em tela cheia.
 *
 * Nas perguntas 2 e 3 ela vem sobre uma cortina que cobre o painel e sai
 * revelando a aba nova. Corte seco entre telas de produto lê como emenda de
 * gravação; a cortina faz a troca virar parte da narrativa.
 */
function Pergunta({
  frame,
  janela,
  texto,
  sozinha = false,
}: {
  frame: number;
  janela: readonly [number, number] | number[];
  texto: string;
  sozinha?: boolean;
}) {
  const [ini, fim] = janela as [number, number];
  if (frame < ini - 6 || frame > fim + 6) return null;

  const cortina = sozinha
    ? 1
    : interpolate(frame, [ini, ini + 16, fim - 20, fim], [0, 1, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: ENTRADA,
      });

  const texto_ = interpolate(frame, [ini + 8, ini + 30, fim - 26, fim - 8], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRADA,
  });

  const sobe = interpolate(frame, [ini + 8, ini + 34], [26, 0], {
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
        opacity: sozinha ? texto_ * 0 + 1 : cortina,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 22,
          opacity: texto_,
          translate: `0px ${sobe}px`,
        }}
      >
        <span style={{ width: 46, height: 4, background: COR.verde, borderRadius: 2 }} />
        <span
          style={{
            fontFamily: PILHA_DE_FONTE,
            fontSize: 82,
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

/* ── cena 2 · a frota responde ───────────────────────────────────────────── */

const FROTA = [
  { id: "Bancada 01", loja: "Loja Centro", ok: true, quando: "há 40 s" },
  { id: "Bancada 02", loja: "Loja Centro", ok: true, quando: "há 1 min" },
  { id: "Bancada 03", loja: "Loja Norte", ok: false, quando: "há 6 h" },
  { id: "Bancada 04", loja: "Loja Norte", ok: true, quando: "há 30 s" },
  { id: "Bancada 05", loja: "Loja Sul", ok: true, quando: "há 50 s" },
  { id: "Bancada 06", loja: "Loja Sul", ok: false, quando: "há 2 h" },
  { id: "Bancada 07", loja: "Loja Leste", ok: true, quando: "há 1 min" },
  { id: "Bancada 08", loja: "Loja Oeste", ok: true, quando: "há 20 s" },
];

function ConteudoFrota({ frame }: { frame: number }) {
  const avisoP = interpolate(frame, [T.aviso, T.aviso + 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRADA,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* o aviso — a resposta que ninguém tinha antes */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "16px 22px",
          borderRadius: 12,
          border: `1px solid ${COR.alerta}55`,
          background: `${COR.alerta}12`,
          opacity: avisoP,
          translate: `0px ${(1 - avisoP) * -12}px`,
        }}
      >
        <Ponto cor={COR.alerta} brilho={1} />
        <span style={{ fontSize: 22, fontWeight: 600, color: COR.texto }}>
          2 aparelhos apagados
        </span>
        <span style={{ fontSize: 22, color: COR.fraco }}>· Loja Norte, Loja Sul</span>
      </div>

      <CabecalhoDaTabela colunas={["Aparelho", "Loja", "Situação", "Última resposta"]} />

      {FROTA.map((d, i) => {
        const { opacidade, deslocamento } = entra(frame, T.frota + i * 7);
        return (
          <div
            key={d.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 240px 240px",
              alignItems: "center",
              padding: "13px 12px",
              borderRadius: 9,
              background: d.ok ? "transparent" : `${COR.alerta}0d`,
              opacity: opacidade,
              translate: `0px ${deslocamento}px`,
            }}
          >
            <span style={{ fontSize: 22, color: COR.texto, fontWeight: 500 }}>{d.id}</span>
            <span style={{ fontSize: 22, color: COR.fraco }}>{d.loja}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <Ponto cor={d.ok ? COR.verde : COR.alerta} brilho={d.ok ? 0.5 : 1} />
              <span style={{ fontSize: 21, color: d.ok ? COR.verde : COR.alerta, fontWeight: 600 }}>
                {d.ok ? "No ar" : "Apagado"}
              </span>
            </span>
            <span style={{ fontSize: 21, color: COR.fraco }}>{d.quando}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── cena 3 · publicar a campanha ────────────────────────────────────────── */

const LOJAS = [
  "Loja Centro",
  "Loja Norte",
  "Loja Sul",
  "Loja Leste",
  "Loja Oeste",
  "Loja Praça",
  "Loja Terminal",
  "Loja Parque",
];

function ConteudoPublicacao({ frame }: { frame: number }) {
  /** As lojas vão sendo marcadas uma a uma. */
  const marcadas = Math.round(
    interpolate(frame, [T.selecao[0], T.selecao[1]], [0, LOJAS.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.3, 0, 0.2, 1),
    }),
  );
  /* O contador segue a LISTA, não um número solto: 8 lojas marcadas × 12
     aparelhos = 96, que é o mesmo 96 do título da frota e da grade. Número que
     não fecha com o que está na tela é a primeira coisa que alguém nota. */
  const lojasNoContador = Math.round(
    interpolate(frame, [T.selecao[0], T.selecao[1]], [0, LOJAS.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.3, 0, 0.2, 1),
    }),
  );
  const publicando = interpolate(frame, [T.botaoPublicar[1], T.noAr[0]], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const noAr = frame >= T.noAr[0];

  return (
    <div style={{ display: "flex", gap: 34, height: "100%" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <Rotulo>Campanha</Rotulo>
        <div
          style={{
            padding: "20px 24px",
            borderRadius: 12,
            border: `1px solid ${COR.linha}`,
            background: COR.superficie,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 25, fontWeight: 600, color: COR.texto }}>Campanha de agosto</span>
          <Selo cor={COR.verde} fundo={`${COR.verde}1f`}>
            {noAr ? "No ar" : "Pronta"}
          </Selo>
        </div>

        <Rotulo>Onde publicar</Rotulo>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {LOJAS.map((loja, i) => {
            const on = i < marcadas;
            return (
              <div
                key={loja}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "11px 16px",
                  borderRadius: 9,
                  background: on ? `${COR.verde}0f` : "transparent",
                  border: `1px solid ${on ? `${COR.verde}44` : COR.linha}`,
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    border: `2px solid ${on ? COR.verde : COR.linha}`,
                    background: on ? COR.verde : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {on && (
                    <svg width="13" height="10" viewBox="0 0 13 10">
                      <path
                        d="M1 5 L5 9 L12 1"
                        fill="none"
                        stroke={COR.fundo}
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span style={{ fontSize: 21, color: on ? COR.texto : COR.fraco }}>{loja}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ width: 520, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        <Rotulo>Alcance</Rotulo>
        <div
          style={{
            padding: "26px 28px",
            borderRadius: 12,
            border: `1px solid ${COR.linha}`,
            background: COR.superficie,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 56, fontWeight: 700, color: COR.texto, letterSpacing: "-0.03em" }}>
              {lojasNoContador}
            </span>
            <span style={{ fontSize: 24, color: COR.fraco }}>lojas</span>
            <span style={{ fontSize: 24, color: COR.linha }}>·</span>
            <span style={{ fontSize: 56, fontWeight: 700, color: COR.texto, letterSpacing: "-0.03em" }}>
              {lojasNoContador * 12}
            </span>
            <span style={{ fontSize: 24, color: COR.fraco }}>aparelhos</span>
          </div>
        </div>

        <BotaoPublicar frame={frame} publicando={publicando} noAr={noAr} />

        {noAr && <GradeDeAparelhos frame={frame} />}
      </div>
    </div>
  );
}

function BotaoPublicar({
  frame,
  publicando,
  noAr,
}: {
  frame: number;
  publicando: number;
  noAr: boolean;
}) {
  const pressiona = interpolate(frame, [T.botaoPublicar[0], T.botaoPublicar[0] + 6], [1, 0.97], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        borderRadius: 12,
        background: COR.verde,
        padding: "20px 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        scale: pressiona,
      }}
    >
      {publicando > 0 && !noAr && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${publicando * 100}%`,
            background: COR.verdeClaro,
          }}
        />
      )}
      <span
        style={{
          position: "relative",
          fontFamily: PILHA_DE_FONTE,
          fontSize: 26,
          fontWeight: 700,
          color: COR.fundo,
        }}
      >
        {noAr ? "No ar em 8 segundos" : "Publicar"}
      </span>
    </div>
  );
}

/** Os 96 aparelhos recebendo a peça, em onda. */
function GradeDeAparelhos({ frame }: { frame: number }) {
  const p = interpolate(frame, [T.noAr[0], T.noAr[1]], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(16, 1fr)", gap: 7 }}>
      {Array.from({ length: 96 }, (_, i) => {
        const on = p > (i % 16) / 16 + Math.floor(i / 16) * 0.03;
        return (
          <span
            key={i}
            style={{
              aspectRatio: "1 / 1.6",
              borderRadius: 3,
              /* Verde a 55%: a grade confirma o alcance, mas quem manda na
                 cena é o botão. Cheia de verde puro ela vira parede. */
              background: on ? `${COR.verde}8c` : COR.superficie2,
              border: `1px solid ${on ? `${COR.verde}b3` : COR.linha}`,
            }}
          />
        );
      })}
    </div>
  );
}

/* ── cena 4 · o dado ─────────────────────────────────────────────────────── */

/** Visitas por hora. Forma, não medição: o eixo não tem número. */
const CURVA = [0.18, 0.26, 0.34, 0.52, 0.46, 0.62, 0.78, 0.71, 0.84, 0.66, 0.48, 0.3];
const HORAS = ["10h", "12h", "14h", "16h", "18h", "20h"];
const RECURSOS = [
  { rotulo: "Câmera", fracao: 1 },
  { rotulo: "Tela", fracao: 0.82 },
  { rotulo: "Som", fracao: 0.61 },
  { rotulo: "Vídeo", fracao: 0.44 },
];

function ConteudoDados({ frame }: { frame: number }) {
  const desenho = interpolate(frame, [T.dados + 10, T.dados + 80], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.32, 0, 0.2, 1),
  });

  const L = 880;
  const A = 520;
  const pontos = CURVA.map((v, i) => ({
    x: (i / (CURVA.length - 1)) * L,
    y: A - v * A,
  }));
  const visiveis = Math.max(2, Math.ceil(pontos.length * desenho));
  const caminho = pontos
    .slice(0, visiveis)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
  const area = `${caminho} L ${pontos[visiveis - 1].x} ${A} L 0 ${A} Z`;

  return (
    <div style={{ display: "flex", gap: 44, height: "100%" }}>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          minWidth: 0,
          justifyContent: "center",
        }}
      >
        <Rotulo>Visitas por hora</Rotulo>
        <svg width="100%" viewBox={`0 0 ${L} ${A + 40}`} style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id="areaVisitas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COR.verde} stopOpacity="0.32" />
              <stop offset="100%" stopColor={COR.verde} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75, 1].map((g) => (
            <line key={g} x1="0" y1={A * g} x2={L} y2={A * g} stroke={COR.linha} strokeWidth="1" />
          ))}
          <path d={area} fill="url(#areaVisitas)" />
          <path d={caminho} fill="none" stroke={COR.verde} strokeWidth="3.5" strokeLinejoin="round" />
          <circle
            cx={pontos[visiveis - 1].x}
            cy={pontos[visiveis - 1].y}
            r="7"
            fill={COR.verde}
          />
          {HORAS.map((h, i) => (
            <text
              key={h}
              x={(i / (HORAS.length - 1)) * L}
              y={A + 32}
              fill={COR.fraco}
              fontSize="19"
              fontFamily={PILHA_DE_FONTE}
              textAnchor={i === 0 ? "start" : i === HORAS.length - 1 ? "end" : "middle"}
            >
              {h}
            </text>
          ))}
        </svg>
      </div>

      <div
        style={{
          width: 560,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 30,
          justifyContent: "center",
        }}
      >
        <Rotulo>Recursos testados</Rotulo>
        {RECURSOS.map((r, i) => (
          <Barra
            key={r.rotulo}
            rotulo={r.rotulo}
            fracao={r.fracao}
            progresso={interpolate(frame, [T.dados + 34 + i * 12, T.dados + 74 + i * 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ENTRADA,
            })}
          />
        ))}
        <div
          style={{
            marginTop: 8,
            padding: "18px 22px",
            borderRadius: 12,
            border: `1px solid ${COR.linha}`,
            background: COR.superficie,
            fontFamily: PILHA_DE_FONTE,
            fontSize: 21,
            lineHeight: 1.5,
            color: COR.fraco,
          }}
        >
          Por loja, por aparelho e por hora do dia.
        </div>
      </div>
    </div>
  );
}

/* ── cena 5 · fecho ──────────────────────────────────────────────────────── */

function Fecho({ frame }: { frame: number }) {
  if (frame < T.fecho[0]) return null;
  const p = interpolate(frame, [T.fecho[0] + 16, T.fecho[0] + 46], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRADA,
  });
  const sai = interpolate(frame, [T.fecho[1] - 22, T.fecho[1]], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: p * sai }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 34 }}>
        {/* O logotipo vetorial. Escrever "LINKA" com a fonte da marca não é a
            marca: o desenho tem espacejamento e formas próprias, e a cor é
            verde-claro + verde, não branco + verde. */}
        <LinkaLogo altura={132} />
        <span style={{ fontFamily: PILHA_DE_FONTE, fontSize: 28, color: COR.fraco }}>
          linkaretail.com.br
        </span>
      </div>
    </AbsoluteFill>
  );
}

/* ── peças de apoio ──────────────────────────────────────────────────────── */

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: PILHA_DE_FONTE,
        fontSize: 17,
        fontWeight: 600,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: COR.fraco,
      }}
    >
      {children}
    </span>
  );
}

function CabecalhoDaTabela({ colunas }: { colunas: string[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 240px 240px",
        padding: "0 12px 12px",
        borderBottom: `1px solid ${COR.linha}`,
      }}
    >
      {colunas.map((c) => (
        <span
          key={c}
          style={{
            fontFamily: PILHA_DE_FONTE,
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: COR.fraco,
          }}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

/** O cursor atravessa a cena 2 (clica no aviso) e a 3 (clica em publicar). */
function CursorDaCena({ frame }: { frame: number }) {
  const noAviso = frame >= T.cursorNoAviso[0] - 26 && frame <= T.cursorNoAviso[1] + 20;
  const noBotao = frame >= T.botaoPublicar[0] - 34 && frame <= T.botaoPublicar[0] + 26;
  if (!noAviso && !noBotao) return null;

  if (noAviso) {
    const p = interpolate(frame, [T.cursorNoAviso[0] - 26, T.cursorNoAviso[0]], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: ENTRADA,
    });
    return (
      <Cursor
        x={interpolate(p, [0, 1], [1150, 415])}
        y={interpolate(p, [0, 1], [745, 250])}
        clicando={interpolate(frame, [T.cursorNoAviso[0] + 4, T.cursorNoAviso[0] + 26], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
        opacidade={interpolate(frame, [T.cursorNoAviso[1], T.cursorNoAviso[1] + 18], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
      />
    );
  }

  const p = interpolate(frame, [T.botaoPublicar[0] - 34, T.botaoPublicar[0]], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRADA,
  });
  return (
    <Cursor
      x={interpolate(p, [0, 1], [850, 1520])}
      y={interpolate(p, [0, 1], [800, 500])}
      clicando={interpolate(frame, [T.botaoPublicar[0], T.botaoPublicar[0] + 22], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })}
      opacidade={interpolate(frame, [T.botaoPublicar[0] + 20, T.botaoPublicar[0] + 26], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })}
    />
  );
}

/** Brilho de fundo, para o painel não flutuar num retângulo chapado. */
function Fundo() {
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(120% 90% at 50% 0%, ${COR.verde}12, transparent 62%)`,
        }}
      />
    </AbsoluteFill>
  );
}
