import { Config } from "@remotion/cli/config";

/**
 * Peça de fundo de página: o que importa é o arquivo ser pequeno, porque ele
 * carrega antes de qualquer coisa que o visitante veio ler. Qualidade alta
 * demais aqui custa segundos de página, não beleza.
 */
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);

/**
 * O limite padrão de 28 s não basta.
 *
 * A fonte da marca são quatro arquivos, e numa renderização longa o Remotion
 * abre várias abas ao mesmo tempo — cada uma pedindo os quatro. Alguma estoura
 * o limite e a renderização inteira morre no meio. Perdeu-se uma de 900
 * quadros exatamente assim.
 */
Config.setDelayRenderTimeoutInMilliseconds(120_000);
