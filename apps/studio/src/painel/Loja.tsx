import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Video } from "@remotion/media";
import { COR } from "../marca";

/**
 * A imagem de loja ao fundo.
 *
 * ── Por que ela existe ────────────────────────────────────────────────────
 * Sem ela a peça é um passeio de software. A tese do produto é sobre uma
 * bancada numa loja, e o painel sozinho nunca chega lá. Aqui está o instante
 * em que o dado nasce: alguém pegando um aparelho de demonstração do suporte.
 *
 * ── A graduação, e quanto ela pesa ────────────────────────────────────────
 * O material é de banco: claro, quente, saturado. Cru, ele briga com o preto
 * da marca e denuncia "peça publicitária" — o contrário do que as telas reais
 * do painel construíram.
 *
 * Mas já esteve escuro DEMAIS. A 38% de brilho a imagem sumia, e o que devia
 * ser vídeo rodando lia como fundo preto parado. Agora está em 62%: dá para
 * ver a mão, o aparelho e a bancada se movendo, e ainda assim o cartão do
 * painel manda na cena.
 *
 * A graduação é CSS, não está gravada no arquivo. O ffmpeg que vem com o
 * Remotion é enxuto e não traz filtro de cor — e acabou sendo melhor assim,
 * porque dá para ajustar vendo o resultado.
 *
 * ── `loop` ────────────────────────────────────────────────────────────────
 * Ligado sempre. Se uma cena passar do fim do clipe, ele recomeça em vez de
 * congelar no último quadro — que foi um defeito real que chegou ao ar.
 */
export function Loja({
  arquivo,
  inicio,
  duracao,
  /** Aproximação lenta, para a imagem não ficar parada atrás do cartão. */
  zoomDe = 1.04,
  zoomPara = 1.12,
  /** A cena de texto precisa de mais escuro: lá o texto fica direto na imagem. */
  brilho = 0.62,
}: {
  arquivo: string;
  inicio: number;
  duracao: number;
  zoomDe?: number;
  zoomPara?: number;
  brilho?: number;
}) {
  const frame = useCurrentFrame();

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
          loop
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: `brightness(${brilho}) saturate(0.6) contrast(1.05)`,
          }}
        />
      </AbsoluteFill>

      {/* Véu verde bem fraco: costura a imagem à paleta sem tingir. */}
      <AbsoluteFill style={{ background: COR.verde, opacity: 0.04 }} />

      {/* Vinheta suave. Antes era pesada e fechava a imagem inteira; agora só
          assenta as bordas e deixa o meio respirar. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(125% 95% at 50% 50%, transparent 42%, ${COR.fundo}cc 100%)`,
        }}
      />
    </AbsoluteFill>
  );
}
