import { interpolate, Easing } from "remotion";
import { COR, PILHA_DE_FONTE } from "../marca";

/**
 * As peças da interface do painel, para vídeo.
 *
 * ── Isto NÃO é o painel de verdade ────────────────────────────────────────
 * É um redesenho para filmar: mais espaçado, tipo maior, menos denso. O painel
 * real é feito para trabalhar oito horas; este é feito para ser lido em três
 * segundos, num quadro que ninguém pode pausar.
 *
 * ── A regra do dado ───────────────────────────────────────────────────────
 * Tudo aqui é neutro e ilustrativo: "Loja Centro", "Bancada 04". Interface com
 * dado de exemplo é prática normal de produto. O que NUNCA entra é número de
 * resultado — nada de "+37% de conversão", nada de seta de crescimento. Esse é
 * o número que a marca cobra na reunião seguinte, e a gente não tem.
 */

export const FONTE_UI = PILHA_DE_FONTE;

/** Curva de entrada: rápida no começo, assenta no fim. Padrão da peça. */
export const ENTRADA = Easing.bezier(0.16, 1, 0.3, 1);

/** Aparece subindo. `atraso` escalona linha por linha. */
export function entra(frame: number, inicio: number, duracao = 18) {
  return {
    opacidade: interpolate(frame, [inicio, inicio + duracao], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: ENTRADA,
    }),
    deslocamento: interpolate(frame, [inicio, inicio + duracao], [14, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: ENTRADA,
    }),
  };
}

/** O ponto de status de um aparelho. */
export function Ponto({ cor, brilho = 0 }: { cor: string; brilho?: number }) {
  return (
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: 999,
        background: cor,
        display: "inline-block",
        flexShrink: 0,
        boxShadow: brilho > 0 ? `0 0 ${12 * brilho}px ${cor}` : undefined,
      }}
    />
  );
}

/** Um selo pequeno, do tipo que rotula estado numa tabela. */
export function Selo({
  children,
  cor = COR.fraco,
  fundo = "transparent",
}: {
  children: React.ReactNode;
  cor?: string;
  fundo?: string;
}) {
  return (
    <span
      style={{
        fontFamily: FONTE_UI,
        fontSize: 15,
        fontWeight: 600,
        letterSpacing: "0.04em",
        color: cor,
        background: fundo,
        border: `1px solid ${fundo === "transparent" ? COR.linha : "transparent"}`,
        borderRadius: 999,
        padding: "4px 12px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/**
 * O cursor do mouse.
 *
 * Ele é o que transforma "tela bonita" em "alguém operando". Sem cursor, o
 * espectador vê um layout; com cursor, vê uma pessoa resolvendo um problema —
 * que é a diferença entre uma peça de design e uma peça de venda.
 */
export function Cursor({
  x,
  y,
  clicando = 0,
  opacidade = 1,
}: {
  x: number;
  y: number;
  clicando?: number;
  opacidade?: number;
}) {
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: opacidade }}>
      {clicando > 0 && (
        <div
          style={{
            position: "absolute",
            left: -18,
            top: -18,
            width: 36,
            height: 36,
            borderRadius: 999,
            border: `2px solid ${COR.verde}`,
            opacity: 1 - clicando,
            scale: 0.4 + clicando * 1.4,
          }}
        />
      )}
      <svg width="26" height="30" viewBox="0 0 26 30" style={{ display: "block" }}>
        <path
          d="M2 2 L2 23 L8 17.5 L12 26.5 L16 24.5 L12.2 15.8 L20.5 15.2 Z"
          fill={COR.texto}
          stroke={COR.fundo}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/** Barra horizontal que cresce — usada nos recursos testados. */
export function Barra({
  rotulo,
  fracao,
  progresso,
}: {
  rotulo: string;
  fracao: number;
  progresso: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <span
        style={{
          fontFamily: FONTE_UI,
          fontSize: 20,
          color: COR.texto,
          width: 96,
          flexShrink: 0,
        }}
      >
        {rotulo}
      </span>
      <div
        style={{
          flex: 1,
          height: 14,
          borderRadius: 999,
          background: COR.superficie2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${fracao * progresso * 100}%`,
            height: "100%",
            borderRadius: 999,
            background: COR.verde,
          }}
        />
      </div>
    </div>
  );
}
