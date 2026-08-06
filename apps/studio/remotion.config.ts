import { Config } from "@remotion/cli/config";

/**
 * Peça de fundo de página: o que importa é o arquivo ser pequeno, porque ele
 * carrega antes de qualquer coisa que o visitante veio ler. Qualidade alta
 * demais aqui custa segundos de página, não beleza.
 */
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);

/**
 * O limite padrão de 28 s não basta, e 120 s também não bastou.
 *
 * A fonte da marca são quatro arquivos, e o Remotion abre várias abas ao mesmo
 * tempo — cada uma pedindo os quatro. Com três vídeos decodificando em
 * 2400×1350, o disco satura e a carga da fonte de alguma aba fica esperando.
 * Quando estoura, a renderização inteira morre no meio: perdi uma de 750
 * quadros no quadro 682, depois de dois minutos de trabalho.
 */
Config.setDelayRenderTimeoutInMilliseconds(300_000);

/**
 * Menos abas em paralelo.
 *
 * O padrão usa quase todos os núcleos, e é isso que satura o disco quando há
 * vídeo pesado em cena. Com 4 a renderização demora um pouco mais e para de
 * morrer no meio — e uma renderização que termina vale mais que uma rápida
 * que falha.
 */
Config.setConcurrency(4);
