import type { NextConfig } from "next";

/**
 * Cabeçalhos de segurança em TODA resposta.
 *
 * Achado na varredura de 29/07: só o HSTS chegava ao navegador (e vinha da
 * Vercel, não daqui). Faltavam as proteções que se ligam por cabeçalho e não
 * custam nada — o tipo de coisa que o procurement de segurança da Motorola pede
 * numa checklist e que, ausente, vira pendência de contrato.
 *
 * - X-Frame-Options: DENY — ninguém embute o painel num iframe. Sem isto, um site
 *   hostil carrega o LINKA invisível por cima do próprio conteúdo e rouba cliques
 *   do operador (clickjacking): a pessoa acha que clica ali, e clica em
 *   "desprovisionar" aqui.
 * - X-Content-Type-Options: nosniff — o navegador não "adivinha" o tipo de um
 *   arquivo servido; fecha o caminho de fazer um upload passar por script.
 * - Referrer-Policy — o endereço de uma tela interna (que carrega id de aparelho,
 *   de loja) não vaza para sites externos quando alguém clica num link de saída.
 * - Permissions-Policy — nega câmera, microfone e geolocalização ao painel, que
 *   não usa nenhum dos três. Reduz o estrago se um script de terceiro entrar.
 *
 * CSP fica de fora POR ENQUANTO, de propósito: uma política mal calibrada quebra
 * o app em produção (Next injeta script inline, o Supabase abre WebSocket), e
 * isso precisa ser medido no ambiente real antes de ligar. Está no backlog como
 * item próprio, não escondido aqui.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  // /frota virou /dispositivos: a tela sempre se chamou "Dispositivos" e a URL
  // dizia outra coisa. Quem tiver o endereco antigo salvo continua chegando —
  // link quebrado nao avisa que quebrou, so parece que o sistema sumiu.
  async redirects() {
    return [
      { source: "/frota", destination: "/dispositivos", permanent: true },
      { source: "/frota/:caminho*", destination: "/dispositivos/:caminho*", permanent: true },
    ];
  },

  transpilePackages: ["@linka/ui", "@linka/shared"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
