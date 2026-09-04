import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Onde o link do e-mail termina: painel.linkaretail.com.br/auth/entrar.
 *
 * ── POR QUE EXISTE ───────────────────────────────────────────────────────────
 * Antes o botão "Entrar no painel" do convite apontava para
 * xkzktmsqtvpkxmzftars.supabase.co/auth/v1/verify?token=... Funcionava, mas
 * quem recebe um convite da marca e vê um endereço de fornecedor com nome
 * aleatório desconfia, e com razão: é exatamente a cara de e-mail de golpe.
 * Agora o link é do painel, e o fornecedor fica onde deve ficar, atrás dele.
 *
 * ── COMO FUNCIONA ────────────────────────────────────────────────────────────
 * O e-mail carrega o HASH do token, não o token nem a sessão. Este handler
 * entrega o hash ao Supabase, que o confere, consome (vale uma vez) e devolve a
 * sessão, gravada em cookie pelo cliente de servidor. A pessoa nunca vê token
 * na barra de endereço, nem no histórico do navegador.
 *
 * Fora da área logada de propósito: quem chega aqui ainda não tem sessão.
 */

// Só os tipos que o Supabase reconhece. Qualquer outra coisa na URL é lixo ou
// tentativa, e vai para a tela de login sem tocar no Auth.
const TIPOS = new Set<EmailOtpType>([
  "magiclink",
  "recovery",
  "invite",
  "signup",
  "email",
  "email_change",
]);

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && tipo && TIPOS.has(tipo)) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
    if (!error) {
      // Recuperação de senha termina na tela que troca a senha; todo o resto
      // termina na entrada do painel.
      const destino = tipo === "recovery" ? "/nova-senha" : "/";
      return NextResponse.redirect(new URL(destino, origin), { status: 303 });
    }
  }

  // Expirado, já usado ou inválido: a tela de login explica, sem dizer qual
  // dos três. Distinguir ajudaria só quem está testando links alheios.
  return NextResponse.redirect(new URL("/login?link=expirado", origin), { status: 303 });
}
