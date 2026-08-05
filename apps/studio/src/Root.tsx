import { Composition } from "remotion";
import { PainelEmMovimento } from "./PainelEmMovimento";

/**
 * As peças de vídeo da LINKA.
 *
 * ── Por que 25 fps, e não 30 ──────────────────────────────────────────────
 * Porque a imagem de loja é 25 fps. Enquanto a composição rodava a 30, o
 * transcode convertia a cadência — e conversão de cadência não interpola,
 * **duplica um quadro a cada cinco**. O vídeo saía com cinco micro-travadas
 * por segundo, embutidas no arquivo. Foi assim que apareceu o "engasgo".
 *
 * Casando os dois em 25, cada quadro da origem é um quadro da peça. Para
 * animação de interface 25 fps é liso; o cinema inteiro roda em 24.
 *
 * Trocou a imagem de fundo por uma de outra cadência? **Mude o fps daqui**,
 * não o do arquivo.
 *
 * ── Por que 1920×1080 ─────────────────────────────────────────────────────
 * É o tamanho nativo dos clipes. A renderização final sai em escala 1,25
 * (2400×1350): a interface é DOM e fica nítida na ampliação, e o vídeo sobe
 * pouco o bastante para não borrar.
 *
 * ── Peças descartadas ─────────────────────────────────────────────────────
 * Houve um `banner-topo` (faixa abstrata para o alto da página) e uma versão
 * desta peça feita de capturas de tela com truque de animação por cima. As
 * duas saíram: a primeira ficou sem lugar quando o herói virou SVG, a segunda
 * porque foto não tem partes para animar.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="painel-em-movimento"
        component={PainelEmMovimento}
        durationInFrames={750}
        fps={25}
        width={1920}
        height={1080}
      />
    </>
  );
};
