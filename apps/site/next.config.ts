import type { NextConfig } from "next";

/**
 * Site público da LINKA — app separado do painel, de propósito.
 *
 * O painel está carregando o piloto. Uma landing não justifica mexer em rota,
 * middleware ou build da coisa que está no ar com aparelho de loja apontando
 * para ela. Aqui é outro deploy, outro domínio, e uma quebra deste site não
 * derruba nada do produto.
 *
 * Os mesmos cabeçalhos de segurança do painel, pelo mesmo motivo: o procurement
 * de segurança de uma marca grande abre o site antes de abrir o produto, e
 * ausência de cabeçalho vira pendência de contrato antes de qualquer conversa
 * técnica.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@linka/ui"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
