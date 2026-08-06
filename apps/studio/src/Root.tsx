import { Composition } from "remotion";
import { PainelEmMovimento } from "./PainelEmMovimento";
import { DURACAO_GRAFICA, PainelGrafico } from "./PainelGrafico";

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
 * ── As duas peças ─────────────────────────────────────────────────────────
 * **`painel-grafico` é a que está no ar** em linkaretail.com.br, escolhida
 * pelo Gabriel na comparação lado a lado: mesmo roteiro e mesmos cartões, mas
 * sem nenhuma imagem de loja — o fundo é a rede da LINKA, contínua do primeiro
 * ao último quadro. Não depende de `public/loja/`.
 *
 * `painel-em-movimento` é a versão anterior, com imagem de loja de banco.
 * Fica aqui como referência e comparação; não é o que a página serve.
 *
 * ── Regra que vale para as duas ───────────────────────────────────────────
 * Transformação contínua NUNCA entra em camada que contém texto. Escala e
 * deslocamento fracionários re-rasterizam cada glifo a cada quadro e a
 * tipografia ferve. Movimento vai no fundo; texto fica travado em pixel
 * cheio. Ver `ancorado` em `painel/cartoes.tsx`.
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
        durationInFrames={1160}
        fps={25}
        width={1920}
        height={1080}
      />
      <Composition
        id="painel-grafico"
        component={PainelGrafico}
        durationInFrames={DURACAO_GRAFICA}
        fps={25}
        width={1920}
        height={1080}
      />
    </>
  );
};
