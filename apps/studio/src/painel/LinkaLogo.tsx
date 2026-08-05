import { COR } from "../marca";

/**
 * O logotipo LINKA de verdade.
 *
 * Mesmos caminhos vetoriais de `apps/site/app/linka-logo.tsx`, que saíram de
 * `branding/Logotipo/Linka_Logo_v2.ai`.
 *
 * ── Por que este arquivo existe, se já existe um igual no site ────────────
 * Lá as cores vêm de variáveis CSS (`var(--color-primary)`); aqui não há
 * Tailwind nem folha de estilo, então elas vêm de `COR`. Mudou a paleta, muda
 * nos dois — é a única duplicação aceita, e está anotada nos dois lados.
 *
 * ── O que NÃO fazer ───────────────────────────────────────────────────────
 * Escrever "LINKA" com a fonte da marca e chamar de logotipo. O logotipo é um
 * desenho próprio, com espacejamento e formas que a fonte não reproduz — e a
 * repartição de cor é LIN em verde-claro e KA em verde, não branco e verde.
 * Já saiu errado num vídeo por eu ter feito exatamente isso.
 */
export function LinkaLogo({ altura }: { altura: number }) {
  return (
    <svg
      viewBox="0 0 1585.42 418.77"
      height={altura}
      style={{ display: "block", width: "auto" }}
      role="img"
      aria-label="LINKA"
    >
      <g transform="translate(-28.94 474.29) scale(1 -1)">
        <path
          fill={COR.verdeClaro}
          d="M341.65 138.73 L341.65 55.52 L28.94 55.52 L28.94 474.29 L138.86 474.29 L138.86 138.73 Z"
        />
        <path fill={COR.verdeClaro} d="M358.57 474.29L468.49 474.29L468.49 55.52L358.57 55.52Z" />
        <path
          fill={COR.verdeClaro}
          d="M667.18 474.29 L514.11 474.29 L514.11 55.52 L624.03 55.52 L624.03 308.56 L760.48 55.52 L802.15 55.52 L802.15 219.62 Z"
        />
        <path
          fill={COR.verde}
          d="M953.04 186.63 L912.07 135.22 L912.07 55.52 L802.15 55.52 L802.15 474.29 L912.07 474.29 L912.07 293.3 L913.13 293.3 L1057.37 474.29 L1182.3 474.29 L1017.87 267.96 L1187.18 55.52 L1057.54 55.52 Z"
        />
        <path
          fill={COR.verde}
          d="M1448.52 223.26 L1392.51 391.25 L1336.51 223.26 Z M1476.26 140.06 L1308.77 140.06 L1280.59 55.52 L1170.67 55.52 L1310.27 474.29 L1474.75 474.29 L1614.36 55.52 L1504.44 55.52 Z"
        />
      </g>
    </svg>
  );
}
