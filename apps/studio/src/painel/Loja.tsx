import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Video } from "@remotion/media";
import { COR } from "../marca";

/**
 * A imagem de loja ao fundo.
 *
 * ── Por que ela existe ────────────────────────────────────────────────────
 * Sem ela a peça é um passeio de software. A tese do produto é sobre uma
 * bancada numa loja, e o painel sozinho nunca chega lá. Aqui está o instante
 * em que o dado nasce — alguém pegando um aparelho de demonstração do suporte.
 *
 * ── A graduação, e por que ela é agressiva ────────────────────────────────
 * O material é de banco de imagem: claro, quente, saturado. Entrando cru, ele
 * briga com o preto da marca e, pior, denuncia "peça publicitária" — que é
 * exatamente o contrário do que as capturas do painel real construíram.
 *
 * Escurecido a 38%, dessaturado e puxado para o frio, ele vira contexto em
 * vez de protagonista: dá o lugar sem tentar vender a loja. O cartão do painel
 * é que tem que brilhar por cima.
 *
 * A graduação é feita aqui, em CSS, e não no arquivo: o ffmpeg que vem com o
 * Remotion é enxuto e não traz os filtros de cor. Melhor assim — dá para
 * ajustar vendo o resultado no editor.
 */
/**
 * Quanto cada clipe tem, em quadros (30 fps).
 *
 * Isto existe porque o erro já aconteceu: os clipes tinham 5 s e a cena mais
 * longa pedia 7,2 s. O vídeo acabava e o navegador segurava o último quadro —
 * lia como travada, sem nenhum aviso em lugar nenhum. Recortados com 9 s.
 *
 * Trocou um clipe? Atualize aqui, senão a checagem abaixo perde o sentido.
 */
const DURACAO_DO_CLIPE: Record<string, number> = {
  "loja/tablet.mp4": 270,
  "loja/bancada.mp4": 270,
  "loja/vitrine.mp4": 270,
};

export function Loja({
  arquivo,
  inicio,
  /** Aproximação lenta, para a imagem não ficar parada atrás do cartão. */
  zoomDe = 1.06,
  zoomPara = 1.14,
  duracao,
}: {
  arquivo: string;
  inicio: number;
  zoomDe?: number;
  zoomPara?: number;
  /** Por quantos quadros a cena vai usar este clipe. */
  duracao: number;
}) {
  const frame = useCurrentFrame();

  const tem = DURACAO_DO_CLIPE[arquivo];
  if (tem !== undefined && duracao > tem) {
    // Falhar alto na renderização é muito melhor do que entregar um vídeo com
    // um trecho congelado que só alguém assistindo vai notar.
    throw new Error(
      `A cena pede ${duracao} quadros de ${arquivo}, que só tem ${tem}. ` +
        `O clipe acabaria e o quadro congelaria. Recorte um trecho mais longo.`,
    );
  }

  return (
    <AbsoluteFill style={{ background: COR.fundo }}>
      <AbsoluteFill
        style={{
          scale: interpolate(frame, [inicio, inicio + duracao], [zoomDe, zoomPara], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.linear,
          }),
        }}
      >
        <Video
          src={staticFile(arquivo)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "brightness(0.38) saturate(0.55) contrast(1.08)",
          }}
        />
      </AbsoluteFill>

      {/* Véu verde bem fraco: costura a imagem à paleta sem tingir. */}
      <AbsoluteFill style={{ background: COR.verde, opacity: 0.05 }} />

      {/* Vinheta: escurece as bordas e joga o olho para o centro, onde o
          cartão do painel vai estar. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 85% at 50% 50%, transparent 30%, ${COR.fundo}dd 100%)`,
        }}
      />
    </AbsoluteFill>
  );
}
