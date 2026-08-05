import { Easing, interpolate, useCurrentFrame } from "remotion";
import { COR, PILHA_DE_FONTE } from "../marca";

/**
 * Os cartões do painel, reconstruídos em DOM.
 *
 * ── Por que não é mais captura de tela ────────────────────────────────────
 * A versão anterior era foto do painel com truques por cima: a imagem fatiada
 * em faixas para "entrar", e a câmera dando zoom. Os dois truques quebraram —
 * as emendas das faixas apareciam no cartão da Loja Sul, e o zoom comia 35 px
 * de cada lado, cortando o menu lateral.
 *
 * Foto não tem partes para animar. Aqui a linha da tabela entra porque ela É
 * uma linha, não porque uma faixa de pixel foi revelada.
 *
 * ── Por que só um cartão de cada vez ──────────────────────────────────────
 * O painel inteiro flutuando sobre a imagem de loja encolheria para dois
 * terços do quadro, e a fonte de 19 px viraria 12 px na tela do visitante.
 * Ilegível. Um cartão só, grande, responde a pergunta e se lê.
 *
 * ── Fidelidade ────────────────────────────────────────────────────────────
 * Cores, raios e tipografia saem dos tokens da marca — os mesmos do painel de
 * verdade. Os textos e números são os da rede de demonstração. Não é o painel
 * inventado que eu tinha feito antes: é o painel, remontado.
 */

const SUAVE = Easing.bezier(0.16, 1, 0.3, 1);

/** A moldura de vidro que segura qualquer cartão sobre a imagem de loja. */
export function Cartao({
  titulo,
  selo,
  inicio,
  largura = 1180,
  children,
}: {
  titulo: string;
  selo?: string;
  inicio: number;
  largura?: number;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [inicio, inicio + 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: SUAVE,
  });

  return (
    <div
      style={{
        width: largura,
        borderRadius: 20,
        border: `1px solid ${COR.linha}`,
        background: `${COR.superficie}f2`,
        backdropFilter: "blur(18px)",
        boxShadow: "0 40px 90px rgba(0,0,0,0.55)",
        overflow: "hidden",
        fontFamily: PILHA_DE_FONTE,
        opacity: p,
        translate: `0px ${(1 - p) * 26}px`,
        scale: 0.985 + p * 0.015,
      }}
    >
      <div
        style={{
          height: 78,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 34px",
          borderBottom: `1px solid ${COR.linha}`,
        }}
      >
        <span style={{ fontSize: 26, fontWeight: 600, color: COR.texto, letterSpacing: "-0.01em" }}>
          {titulo}
        </span>
        {selo && (
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "0.05em",
              color: COR.fraco,
              border: `1px solid ${COR.linha}`,
              borderRadius: 999,
              padding: "5px 14px",
            }}
          >
            {selo}
          </span>
        )}
      </div>
      <div style={{ padding: "26px 34px 30px" }}>{children}</div>
    </div>
  );
}

/* ── a frota, respondendo "o aparelho está ligado?" ───────────────────────── */

const FROTA = [
  { cod: "DM001", nome: "Bancada 01", loja: "Loja Centro", ok: true, quando: "20 s" },
  { cod: "DM002", nome: "Bancada 02", loja: "Loja Centro", ok: true, quando: "9 s" },
  { cod: "DM003", nome: "Bancada 03", loja: "Loja Norte", ok: false, quando: "4 h" },
  { cod: "DM004", nome: "Bancada 01", loja: "Loja Norte", ok: true, quando: "44 s" },
  { cod: "DM005", nome: "Bancada 02", loja: "Loja Sul", ok: true, quando: "10 s" },
  { cod: "DM006", nome: "Bancada 03", loja: "Loja Sul", ok: false, quando: "4 h" },
  { cod: "DM007", nome: "Bancada 01", loja: "Loja Leste", ok: true, quando: "26 s" },
];

export function CartaoFrota({ inicio }: { inicio: number }) {
  const frame = useCurrentFrame();

  /** O aviso só desce depois que as linhas vermelhas já apareceram. */
  const aviso = interpolate(frame, [inicio + 74, inicio + 96], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: SUAVE,
  });

  return (
    <Cartao titulo="Frota · 96 aparelhos" selo="Atualizado agora" inicio={inicio}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "15px 22px",
          marginBottom: 18,
          borderRadius: 12,
          border: `1px solid ${COR.alerta}55`,
          background: `${COR.alerta}14`,
          opacity: aviso,
          translate: `0px ${(1 - aviso) * -14}px`,
        }}
      >
        <span
          style={{
            width: 11,
            height: 11,
            borderRadius: 999,
            background: COR.alerta,
            boxShadow: `0 0 14px ${COR.alerta}`,
          }}
        />
        <span style={{ fontSize: 21, fontWeight: 600, color: COR.texto }}>
          2 aparelhos apagados
        </span>
        <span style={{ fontSize: 21, color: COR.fraco }}>· Loja Norte, Loja Sul</span>
      </div>

      <Colunas titulos={["Situação", "Código", "Aparelho", "Loja", "Últ. contato"]} />

      {FROTA.map((d, i) => {
        // Cada linha entra sozinha, e é isso que dá o ritmo de frota chegando.
        const entra = inicio + 22 + i * 7;
        const p = interpolate(frame, [entra, entra + 18], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: SUAVE,
        });
        // O ponto de status acende depois da linha assentar.
        const acende = interpolate(frame, [entra + 12, entra + 24], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const cor = d.ok ? COR.verde : COR.alerta;

        return (
          <div
            key={d.cod}
            style={{
              display: "grid",
              gridTemplateColumns: "190px 130px 1fr 1fr 150px",
              alignItems: "center",
              padding: "13px 10px",
              borderRadius: 9,
              background: d.ok ? "transparent" : `${COR.alerta}0f`,
              opacity: p,
              translate: `0px ${(1 - p) * 10}px`,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: cor,
                  opacity: acende,
                  boxShadow: `0 0 ${10 * acende}px ${cor}`,
                }}
              />
              <span style={{ fontSize: 20, fontWeight: 600, color: cor, opacity: acende }}>
                {d.ok ? "No ar" : "Fora do ar"}
              </span>
            </span>
            <span style={{ fontSize: 20, color: COR.fraco }}>{d.cod}</span>
            <span style={{ fontSize: 20, color: COR.texto, fontWeight: 500 }}>{d.nome}</span>
            <span style={{ fontSize: 20, color: COR.fraco }}>{d.loja}</span>
            <span style={{ fontSize: 20, color: COR.fraco }}>{d.quando}</span>
          </div>
        );
      })}
    </Cartao>
  );
}

/* ── publicar, respondendo "está com a campanha certa?" ───────────────────── */

const LOJAS = [
  "Loja Centro",
  "Loja Norte",
  "Loja Sul",
  "Loja Leste",
  "Loja Praça",
  "Loja Terminal",
  "Loja Parque",
  "Loja Estação",
];

export function CartaoPublicar({ inicio }: { inicio: number }) {
  const frame = useCurrentFrame();

  const marcadas = interpolate(frame, [inicio + 24, inicio + 84], [0, LOJAS.length], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.3, 0, 0.2, 1),
  });
  const publicando = interpolate(frame, [inicio + 96, inicio + 122], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const noAr = frame >= inicio + 122;
  const onda = interpolate(frame, [inicio + 122, inicio + 168], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Cartao titulo="Conteúdo · Campanha de agosto" inicio={inicio}>
      <div style={{ display: "flex", gap: 30 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
          <Rotulo>Onde publicar</Rotulo>
          {LOJAS.map((loja, i) => {
            const on = i < marcadas;
            return (
              <div
                key={loja}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 13,
                  padding: "10px 15px",
                  borderRadius: 9,
                  background: on ? `${COR.verde}12` : "transparent",
                  border: `1px solid ${on ? `${COR.verde}4d` : COR.linha}`,
                  transition: "none",
                }}
              >
                <span
                  style={{
                    width: 21,
                    height: 21,
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
                    <svg width="12" height="9" viewBox="0 0 13 10">
                      <path
                        d="M1 5 L5 9 L12 1"
                        fill="none"
                        stroke={COR.fundo}
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span style={{ fontSize: 20, color: on ? COR.texto : COR.fraco }}>{loja}</span>
              </div>
            );
          })}
        </div>

        <div style={{ width: 470, display: "flex", flexDirection: "column", gap: 14 }}>
          <Rotulo>Alcance</Rotulo>
          <div
            style={{
              padding: "22px 26px",
              borderRadius: 12,
              border: `1px solid ${COR.linha}`,
              background: COR.fundo,
              display: "flex",
              alignItems: "baseline",
              gap: 11,
            }}
          >
            <Numero>{Math.round(marcadas)}</Numero>
            <span style={{ fontSize: 22, color: COR.fraco }}>lojas</span>
            <span style={{ fontSize: 22, color: COR.linha }}>·</span>
            <Numero>{Math.round(marcadas) * 12}</Numero>
            <span style={{ fontSize: 22, color: COR.fraco }}>aparelhos</span>
          </div>

          <div
            style={{
              borderRadius: 12,
              background: COR.verde,
              padding: "18px 26px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {!noAr && publicando > 0 && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${publicando * 100}%`,
                  background: COR.verdeClaro,
                }}
              />
            )}
            <span
              style={{
                position: "relative",
                fontSize: 24,
                fontWeight: 700,
                color: COR.fundo,
              }}
            >
              {noAr ? "No ar em 8 segundos" : "Publicar"}
            </span>
          </div>

          {noAr && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(16, 1fr)", gap: 6 }}>
              {Array.from({ length: 96 }, (_, i) => {
                // A onda varre por coluna e escorre pelas linhas: acender tudo
                // ao mesmo tempo lê como pisca-pisca, não como distribuição.
                const on = onda > (i % 16) / 16 + Math.floor(i / 16) * 0.035;
                return (
                  <span
                    key={i}
                    style={{
                      aspectRatio: "1 / 1.6",
                      borderRadius: 3,
                      background: on ? `${COR.verde}99` : COR.superficie2,
                      border: `1px solid ${on ? `${COR.verde}cc` : COR.linha}`,
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Cartao>
  );
}

/* ── o dado, respondendo "qual recurso o cliente mais procura?" ───────────── */

const RECURSOS = [
  { nome: "Câmera", valor: 2338 },
  { nome: "Tela", valor: 1638 },
  { nome: "Som", valor: 952 },
  { nome: "Vídeo", valor: 651 },
];
const MAIOR = RECURSOS[0].valor;

/** A curva de movimento por hora. Forma, não medição: o eixo não tem número. */
const HORAS = [
  { h: "10", v: 0.16 }, { h: "11", v: 0.24 }, { h: "12", v: 0.33 },
  { h: "13", v: 0.42 }, { h: "14", v: 0.55 }, { h: "15", v: 0.64 },
  { h: "16", v: 0.66 }, { h: "17", v: 0.88 }, { h: "18", v: 1.0 },
  { h: "19", v: 0.88 }, { h: "20", v: 0.78 }, { h: "21", v: 0.67 },
];

export function CartaoDados({ inicio }: { inicio: number }) {
  const frame = useCurrentFrame();

  return (
    <Cartao titulo="Dados · últimos 7 dias" selo="12 aparelhos · 4 lojas" inicio={inicio}>
      <Rotulo>O que o visitante quis testar</Rotulo>
      <div style={{ display: "flex", flexDirection: "column", gap: 15, margin: "16px 0 30px" }}>
        {RECURSOS.map((r, i) => {
          const entra = inicio + 26 + i * 10;
          const p = interpolate(frame, [entra, entra + 34], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: SUAVE,
          });
          return (
            <div key={r.nome} style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <span style={{ fontSize: 21, color: COR.texto, width: 110, flexShrink: 0 }}>
                {r.nome}
              </span>
              <div
                style={{
                  flex: 1,
                  height: 15,
                  borderRadius: 999,
                  background: COR.superficie2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${(r.valor / MAIOR) * p * 100}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: COR.verde,
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: 21,
                  color: COR.fraco,
                  width: 90,
                  textAlign: "right",
                  flexShrink: 0,
                }}
              >
                {Math.round(r.valor * p).toLocaleString("pt-BR")}
              </span>
            </div>
          );
        })}
      </div>

      <Rotulo>Movimento por hora</Rotulo>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 12,
          height: 150,
          marginTop: 16,
        }}
      >
        {HORAS.map((x, i) => {
          const entra = inicio + 82 + i * 4;
          const p = interpolate(frame, [entra, entra + 22], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: SUAVE,
          });
          return (
            <div
              key={x.h}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 9,
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: x.v * 118 * p,
                  borderRadius: 6,
                  background: COR.verde,
                  opacity: 0.45 + x.v * 0.55,
                }}
              />
              <span style={{ fontSize: 16, color: COR.fraco }}>{x.h}h</span>
            </div>
          );
        })}
      </div>
    </Cartao>
  );
}

/* ── peças ────────────────────────────────────────────────────────────────── */

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 15,
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

function Numero({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 48,
        fontWeight: 700,
        color: COR.texto,
        letterSpacing: "-0.03em",
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
}

function Colunas({ titulos }: { titulos: string[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "190px 130px 1fr 1fr 150px",
        padding: "0 10px 11px",
        borderBottom: `1px solid ${COR.linha}`,
      }}
    >
      {titulos.map((c) => (
        <span
          key={c}
          style={{
            fontSize: 14,
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
