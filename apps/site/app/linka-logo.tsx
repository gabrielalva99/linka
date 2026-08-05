/**
 * Logotipo LINKA, vetorizado a partir de branding/Logotipo/Linka_Logo_v2.ai.
 *
 * Em SVG e não PNG porque logotipo em bitmap borra em tela retina e no zoom.
 * As cores saem dos tokens: quando o design mandar ajuste de paleta, muda em
 * um lugar e o logotipo acompanha — que é a regra do projeto.
 */
export function LinkaLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1585.42 418.77" className={className} role="img" aria-label="LINKA">
      <g transform="translate(-28.94 474.29) scale(1 -1)">
        <path fill="var(--color-brand-100)" d="M341.65 138.73 L341.65 55.52 L28.94 55.52 L28.94 474.29 L138.86 474.29 L138.86 138.73 Z"/>
        <path fill="var(--color-brand-100)" d="M358.57 474.29L468.49 474.29L468.49 55.52L358.57 55.52Z"/>
        <path fill="var(--color-brand-100)" d="M667.18 474.29 L514.11 474.29 L514.11 55.52 L624.03 55.52 L624.03 308.56 L760.48 55.52 L802.15 55.52 L802.15 219.62 Z"/>
        <path fill="var(--color-primary)" d="M953.04 186.63 L912.07 135.22 L912.07 55.52 L802.15 55.52 L802.15 474.29 L912.07 474.29 L912.07 293.3 L913.13 293.3 L1057.37 474.29 L1182.3 474.29 L1017.87 267.96 L1187.18 55.52 L1057.54 55.52 Z"/>
        <path fill="var(--color-primary)" d="M1448.52 223.26 L1392.51 391.25 L1336.51 223.26 Z M1476.26 140.06 L1308.77 140.06 L1280.59 55.52 L1170.67 55.52 L1310.27 474.29 L1474.75 474.29 L1614.36 55.52 L1504.44 55.52 Z"/>
      </g>
    </svg>
  );
}
