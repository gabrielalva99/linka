import { Easing } from "remotion";

/**
 * As curvas de movimento da peça, escolhidas por PAPEL.
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 * A peça inteira usava uma curva só, `bezier(0.16, 1, 0.3, 1)`, copiada em
 * quatro arquivos. Ela é a easeOutExpo: **87% do movimento acontece em 30% da
 * duração.** Toda duração escrita no código mentia por um fator de três — o
 * cartão "entrava em 22 quadros" e o olho lia 0,28 s. Foi por isso que esticar
 * os números não resolveu a sensação de corrido: a curva comia o tempo.
 *
 * E como era a mesma assinatura em tudo, cada elemento chegava com o mesmo
 * chicote. Sem variação de curva não existe peso: o cartão herói e uma linha
 * de tabela pareciam a mesma coisa.
 *
 * ── A regra ───────────────────────────────────────────────────────────────
 * Escolha pelo papel do elemento, nunca por gosto. E se quiser mudar o
 * caráter da peça, mude AQUI — não espalhe uma curva nova pelos arquivos.
 */

/** Entrada de conteúdo. Chega decidido e assenta. 87% em ~50% do tempo. */
export const ENTRA = Easing.bezier(0.33, 1, 0.68, 1);

/** Saída. Acelera para fora, em vez de desbotar em ritmo constante. */
export const SAI = Easing.bezier(0.32, 0, 0.67, 0);

/** Cena, cortina, câmera. Começa e termina devagar: dá peso e massa. */
export const CENA = Easing.bezier(0.65, 0, 0.35, 1);

/**
 * Acento. Só para o que DEVE estalar: o LED acendendo, o check marcando, o
 * pouso da marca. É a curva antiga — ela não estava errada, estava em tudo.
 */
export const ESTALO = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * Atraso em cadeia com curva, para grupos não entrarem em metrônomo.
 *
 * `expoente` acima de 1 começa esparso e comprime no fim (o grupo "pousa");
 * abaixo de 1 faz o contrário. Intervalo constante é literalmente
 * `animation-delay: calc(var(--i) * 60ms)` — a assinatura de template.
 */
export function emCadeia(i: number, quantos: number, total: number, expoente = 1.55) {
  if (quantos <= 1) return 0;
  return total * Math.pow(i / (quantos - 1), expoente);
}
