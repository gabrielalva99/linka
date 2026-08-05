import { Easing } from "remotion";
import { COR } from "../marca";

/**
 * O que sobra de interface desenhada na peça: o cursor, e a curva de entrada.
 *
 * Aqui morava um painel inteiro que eu tinha desenhado imitando o produto.
 * Ele foi descartado quando as capturas do painel de verdade entraram — dava
 * para fazer bonito, mas ilustração do produto não prova que o produto existe.
 */

/** Curva de entrada: rápida no começo, assenta no fim. Padrão da peça. */
export const ENTRADA = Easing.bezier(0.16, 1, 0.3, 1);

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

