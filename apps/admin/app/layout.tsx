import type { Metadata } from "next";

/**
 * O painel roda em Sao Paulo, junto do banco.
 *
 * O DEFEITO QUE ISTO CONSERTA. A Vercel executava as funcoes em iad1
 * (Washington) enquanto o Supabase esta em gru1 (Sao Paulo). Cada requisicao
 * saia do Brasil, atravessava o continente para rodar, voltava ao Brasil para
 * consultar o banco e refazia o caminho — e uma tela do painel faz varias
 * consultas. Medido em producao: 1 SEGUNDO so para o proxy conferir a sessao e
 * redirecionar, contra 90 ms do que e servido pela borda. A visao geral, que e
 * a tela com mais consultas, ficava tao lenta que o clique no menu parecia nao
 * ter funcionado, e a pessoa clicava de novo.
 *
 * `regions` no vercel.json cobre as funcoes; isto aqui declara a mesma
 * preferencia no codigo, onde ela e lida junto com o resto.
 */
export const preferredRegion = ["gru1"];
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

/**
 * New Black Typeface — a fonte da marca (board v03).
 *
 * Servida do próprio domínio, não de CDN: a fonte é licenciada e o painel roda
 * atrás de login. Só os quatro pesos que a interface usa de fato — cada peso
 * é download que o operador de loja paga em 4G.
 *
 * `display: swap` de propósito: com a fonte ainda carregando, o texto aparece
 * na fonte do sistema em vez de a tela ficar em branco.
 */
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

// Números de telemetria e códigos de aparelho pedem largura fixa para alinhar
// em coluna; a fonte da marca não tem versão monoespaçada.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LINKA · Painel",
  description:
    "Gestão, conteúdo e analytics para dispositivos de demonstração no varejo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${marca.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
