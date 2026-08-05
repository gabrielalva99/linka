import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { CONTATO, RESUMO, SITE } from "./site";

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
 * A ABA DIZ SÓ "LINKA", E O BUSCADOR ENTENDE O RESTO POR OUTROS CAMINHOS.
 *
 * O título é o sinal mais forte de uma página, e abrir mão dele custa. A saída
 * não é enfiar palavra-chave na aba, é alimentar os outros lugares que o
 * buscador lê e que ninguém vê numa aba aberta:
 *
 *   description   o texto que aparece embaixo do link no resultado da busca
 *   h1            "Sua marca tem aparelhos em dezenas de lojas", na página
 *   dado estruturado  quem é a empresa e o que o produto faz, em JSON-LD
 *   openGraph     o que aparece quando alguém cola o link no WhatsApp
 *   canonical     um endereço só, para www e apex não virarem dois sites
 *
 * O `template` cobre as páginas internas: a política vira "Política de
 * privacidade · LINKA" sozinha, e a home fica com o `default` limpo.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "LINKA", template: "%s · LINKA" },
  description: RESUMO,
  applicationName: "LINKA",
  category: "technology",
  keywords: [
    "aparelho de demonstração",
    "vitrine de loja",
    "varejo físico",
    "gestão de frota de dispositivos",
    "retail media",
    "trade marketing",
  ],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    siteName: "LINKA",
    title: "O aparelho de demonstração da sua marca, sob controle e medido",
    description: RESUMO,
    url: SITE,
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "O aparelho de demonstração da sua marca, sob controle e medido",
    description: RESUMO,
  },
};

/**
 * Quem é a LINKA, na linguagem que o buscador lê.
 *
 * É aqui que a explicação que saiu da aba volta a existir. O buscador usa isto
 * para entender que LINKA é uma organização e um produto de software, em vez de
 * uma palavra de cinco letras sem contexto — que é exatamente o problema de um
 * título curto numa marca que ninguém procura pelo nome ainda.
 */
const dadoEstruturado = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE}/#organizacao`,
      name: "LINKA",
      url: SITE,
      description: RESUMO,
      email: CONTATO,
      areaServed: "BR",
    },
    {
      "@type": "SoftwareApplication",
      name: "LINKA",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Android, Web",
      inLanguage: "pt-BR",
      description: RESUMO,
      url: SITE,
      publisher: { "@id": `${SITE}/#organizacao` },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={marca.variable}>
      <body className="antialiased">
        {children}
        <script
          type="application/ld+json"
          // O conteúdo é nosso e estático; não há entrada de usuário aqui.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(dadoEstruturado) }}
        />
      </body>
    </html>
  );
}
