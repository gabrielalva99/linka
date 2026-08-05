import { Composition } from "remotion";
import { PainelEmMovimento } from "./PainelEmMovimento";

/**
 * As peças de vídeo da LINKA. Padrão: 30 fps.
 *
 * Houve aqui um `banner-topo`, faixa abstrata de 10 s para o alto da página.
 * Foi descartado em 05/08: o herói passou a ser a rede de sinais em SVG, que
 * não pesa arquivo nenhum, e a faixa não tinha mais onde entrar. Peça sem
 * lugar na página é peça que envelhece errado e alguém reaproveita torto.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* O painel respondendo as três perguntas da seção 01 da página.
          16:9 porque painel é horizontal — em vertical ele não lê. */}
      <Composition
        id="painel-em-movimento"
        component={PainelEmMovimento}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
