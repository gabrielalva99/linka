import { interpolate, useCurrentFrame } from "remotion";
import { COR, PILHA_DE_FONTE } from "../marca";
import { ENTRADA } from "./pecas";

/**
 * Animações sobre as capturas do painel.
 *
 * ── O problema ────────────────────────────────────────────────────────────
 * Captura de tela é imagem parada. O painel real anima barra e número quando
 * carrega, e a foto perde isso — o que sobra parece um slide.
 *
 * ── As duas técnicas, e por que são diferentes ────────────────────────────
 * VARREDURA para barras e gráficos: em vez de redesenhar a barra, eu escondo
 * a região e revelo da esquerda para a direita. A barra "cresce" porque está
 * sendo descoberta. Precisa de UM retângulo por região e é imune a mudança de
 * cor, de fonte ou de espaçamento no painel.
 *
 * CONTADOR para números: aqui não tem jeito, o número precisa ser redesenhado.
 * Então eu tampo o original com um retângulo da cor do cartão e escrevo por
 * cima, na mesma fonte, no mesmo tamanho e na mesma cor.
 *
 * ── De onde vêm as coordenadas ────────────────────────────────────────────
 * Do próprio navegador, com `getBoundingClientRect()`, na hora em que a
 * captura foi tirada. Não são estimadas olhando o PNG. Se as capturas forem
 * refeitas e o layout do painel mudar, elas precisam ser medidas de novo —
 * o caminho está em `../capturar-painel.md`.
 *
 * Todas valem para o quadro de 1760×990.
 */

/**
 * Revela uma região da esquerda para a direita.
 *
 * O gradiente na borda evita o corte reto, que denunciaria o truque.
 */
export function Varredura({
  x,
  y,
  w,
  h,
  inicio,
  duracao = 34,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  inicio: number;
  duracao?: number;
}) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [inicio, inicio + duracao], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRADA,
  });
  if (p >= 1) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: x + w * p,
        top: y,
        width: w * (1 - p) + 2,
        height: h,
        background: `linear-gradient(90deg, ${COR.superficie}00 0px, ${COR.superficie} 26px)`,
      }}
    />
  );
}

/**
 * Tampa um número e escreve a contagem por cima.
 *
 * `fundo` é a cor do cartão onde o número mora — sem ela sobra o número
 * original aparecendo por baixo.
 */
export function Contador({
  x,
  y,
  w,
  h,
  ate,
  inicio,
  duracao = 40,
  tamanho,
  cor,
  fundo,
  peso = 600,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  ate: number;
  inicio: number;
  duracao?: number;
  tamanho: number;
  cor: string;
  fundo: string;
  peso?: number;
}) {
  const frame = useCurrentFrame();
  const valor = Math.round(
    interpolate(frame, [inicio, inicio + duracao], [0, ate], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: ENTRADA,
    }),
  );

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        background: fundo,
        display: "flex",
        alignItems: "center",
        fontFamily: PILHA_DE_FONTE,
        fontSize: tamanho,
        fontWeight: peso,
        color: cor,
        lineHeight: 1,
      }}
    >
      {valor}
    </div>
  );
}
