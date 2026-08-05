import { COR } from "../marca";
import { LinkaLogo } from "./LinkaLogo";
import { FONTE_UI } from "./pecas";

/**
 * A moldura do painel: barra lateral, cabeçalho e a área de conteúdo.
 *
 * Ela fica no ar da cena 2 até a 4 — o conteúdo troca por dentro, a moldura
 * não. É o que dá a sensação de UM produto em uso, e não de três telas soltas
 * emendadas por corte.
 */

const NAV = ["Frota", "Conteúdo", "Dados", "Lojas", "Ajustes"];

export function Chrome({
  aba,
  titulo,
  acao,
  children,
}: {
  /** Índice do item aceso na lateral. */
  aba: number;
  titulo: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        borderRadius: 20,
        overflow: "hidden",
        border: `1px solid ${COR.linha}`,
        background: COR.fundo,
        fontFamily: FONTE_UI,
      }}
    >
      <BarraLateral aba={aba} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Cabecalho titulo={titulo} acao={acao} />
        <div style={{ flex: 1, position: "relative", padding: "34px 44px", minHeight: 0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function BarraLateral({ aba }: { aba: number }) {
  return (
    <div
      style={{
        width: 236,
        flexShrink: 0,
        borderRight: `1px solid ${COR.linha}`,
        background: COR.superficie,
        padding: "26px 0",
        display: "flex",
        flexDirection: "column",
        gap: 26,
      }}
    >
      {/* O logotipo de verdade, não "LINKA" escrito com a fonte da marca. */}
      <div style={{ padding: "0 26px" }}>
        <LinkaLogo altura={26} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "0 14px" }}>
        {NAV.map((item, i) => {
          const ativo = i === aba;
          return (
            <div
              key={item}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 9,
                background: ativo ? COR.superficie2 : "transparent",
                color: ativo ? COR.texto : COR.fraco,
                fontSize: 19,
                fontWeight: ativo ? 600 : 400,
              }}
            >
              <span
                style={{
                  width: 3,
                  height: 17,
                  borderRadius: 2,
                  background: ativo ? COR.verde : "transparent",
                  flexShrink: 0,
                }}
              />
              {item}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Cabecalho({ titulo, acao }: { titulo: string; acao?: React.ReactNode }) {
  return (
    <div
      style={{
        height: 86,
        flexShrink: 0,
        borderBottom: `1px solid ${COR.linha}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 44px",
        background: COR.superficie,
      }}
    >
      <span style={{ fontSize: 27, fontWeight: 600, color: COR.texto, letterSpacing: "-0.01em" }}>
        {titulo}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>{acao}</div>
    </div>
  );
}
