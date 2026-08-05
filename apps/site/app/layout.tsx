import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/** New Black Typeface — a fonte da marca, servida do próprio domínio. */
const marca = localFont({
  src: [
    { path: "./fonts/NewBlackTypeface-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/NewBlackTypeface-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/NewBlackTypeface-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/NewBlackTypeface-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-brand",
  display: "swap",
});

/**
 * O título da aba é só "LINKA", por pedido do Gabriel.
 *
 * Perde-se palavra-chave na busca, e a `description` abaixo é quem carrega esse
 * peso agora. Numa aba aberta, porém, o que se lê são os primeiros caracteres:
 * "LINKA" inteiro vale mais do que "LINKA — o aparelho de dem…" cortado.
 */
export const metadata: Metadata = {
  title: "LINKA",
  description:
    "Plataforma que controla, atualiza e mede os aparelhos de demonstração de uma marca no varejo físico. Sem câmera, sem reconhecimento facial, sem dado biométrico.",
  openGraph: {
    title: "LINKA",
    description:
      "O aparelho de demonstração da sua marca, sob controle e medido, em todas as lojas.",
    locale: "pt_BR",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={marca.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
