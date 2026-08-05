import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

/**
 * A marca LINKA em valores de JavaScript.
 *
 * Os tokens de verdade moram em `packages/ui/src/tokens.css` e servem o painel
 * e o site. Aqui eles estão duplicados porque o Remotion não usa Tailwind: o
 * estilo vai em objeto inline, quadro a quadro. Mudou lá, muda aqui.
 */
export const COR = {
  fundo: "#0a0b0a",
  superficie: "#121513",
  superficie2: "#1a1e1b",
  linha: "#262b27",
  texto: "#f7f9f8",
  fraco: "#8a938c",
  verde: "#00f24f",
  verdeClaro: "#d9f9e3",

  /* Status. "Deu certo" NÃO é a cor da marca — num produto de dados, verde
     tem que significar uma coisa só. Mesma regra do painel. */
  sucesso: "#00c840",
  atencao: "#f5b301",
  alerta: "#ff4d4f",
} as const;

export const FONTE = "New Black";

/**
 * A fonte da marca, carregada do `public/`.
 *
 * `display: "block"` de propósito: numa página, texto invisível por um instante
 * é pior que texto na fonte errada. Aqui é o contrário — o quadro vira arquivo.
 * Se o Remotion renderizar antes da fonte chegar, o mp4 sai na fonte de sistema
 * e ninguém percebe até estar no ar.
 */
Promise.all(
  (
    [
      ["Regular", "400"],
      ["Medium", "500"],
      ["SemiBold", "600"],
      ["Bold", "700"],
    ] as const
  ).map(([corte, peso]) =>
    loadFont({
      family: FONTE,
      url: staticFile(`fonts/NewBlackTypeface-${corte}.woff2`),
      weight: peso,
      display: "block",
    }),
  ),
);

export const PILHA_DE_FONTE = `'${FONTE}', ui-sans-serif, system-ui, sans-serif`;
