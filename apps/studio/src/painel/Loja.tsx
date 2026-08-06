import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Video } from "@remotion/media";
import { COR } from "../marca";
import { CENA } from "../curvas";

/**
 * A imagem de loja ao fundo.
 *
 * ── Por que ela existe ────────────────────────────────────────────────────
 * Sem ela a peça é um passeio de software. A tese do produto é sobre uma
 * bancada numa loja, e o painel sozinho nunca chega lá. Aqui está o instante
 * em que o dado nasce: alguém pegando um aparelho de demonstração do suporte.
 *
 * ── `deInicio` existe por causa de um bug que passou despercebido ─────────
 * Sem `<Sequence>`, o cabeçote do vídeo segue o quadro da COMPOSIÇÃO, não o
 * da cena. Como cada clipe tem 225 quadros, o `loop` dava a volta nos quadros
 * 225, 450 e 675 — que caíam bem no meio das três cenas de cartão. Era um
 * corte seco acidental dentro de cada cena, e a varredura de quadros
 * repetidos nunca ia achar (um salto não é uma repetição).
 *
 * Agora cada cena vive dentro de uma `<Sequence>`, o tempo do vídeo é local, e
 * `deInicio` escolhe de que ponto do arquivo aquela cena parte. Isso resolve o
 * segundo defeito junto: antes `bancada.mp4` era usado em duas cenas partindo
 * quase do mesmo ponto, e o filme mostrava o mesmo plano duas vezes em 33 s.
 *
 * ── A graduação ───────────────────────────────────────────────────────────
 * O material é de banco: claro, quente, saturado. Cru, ele briga com o preto
 * da marca e denuncia "peça publicitária" — o contrário do que as telas reais
 * do painel construíram. Mas já esteve escuro demais: a 38% o vídeo lia como
 * fundo preto parado. O padrão agora é 62%, e cada cena pode variar — a peça
 * clareia conforme o argumento avança, para não ter um platô de luz.
 *
 * ── A câmera tem massa ────────────────────────────────────────────────────
 * O zoom usava `Easing.linear`, que é o keyframe sem curva do After Effects —
 * a assinatura mais antiga de "ninguém tocou nas curvas". E a taxa variava
 * entre cenas, então no corte a câmera mudava de velocidade de repente.
 */
export function Loja({
  arquivo,
  duracao,
  /** Segundo do arquivo em que esta cena começa. Evita repetir plano. */
  deInicio = 0,
  zoomDe = 1.04,
  zoomPara = 1.11,
  brilho = 0.62,
}: {
  arquivo: string;
  /** Quantos quadros a cena dura. Governa o percurso da câmera. */
  duracao: number;
  deInicio?: number;
  zoomDe?: number;
  zoomPara?: number;
  brilho?: number;
}) {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ background: COR.fundo }}>
      <AbsoluteFill
        style={{
          scale: interpolate(frame, [0, duracao], [zoomDe, zoomPara], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: CENA,
          }),
        }}
      >
        <Video
          src={staticFile(arquivo)}
          trimBefore={deInicio * 25}
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

      {/* Vinheta suave. Assenta as bordas e deixa o meio respirar. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(125% 95% at 50% 50%, transparent 44%, ${COR.fundo}c4 100%)`,
        }}
      />
    </AbsoluteFill>
  );
}
