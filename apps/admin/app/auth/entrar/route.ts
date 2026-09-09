import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { criarClienteDeRota } from "@/lib/supabase/route";

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
 * sessão. A pessoa nunca vê token na barra de endereço, nem no histórico do
 * navegador.
 *
 * ── A SESSÃO PRECISA SAIR NA RESPOSTA, E ISSO JÁ FALHOU ─────────────────────
 * Este handler termina em `NextResponse.redirect`, que é um objeto novo: o que
 * o Supabase grava no cookie store do Next não vai junto. Por isso o cliente
 * vem de `criarClienteDeRota`, e TODA saída passa por `aplicar`.
 *
 * Sem isso o defeito é traiçoeiro: o link é aceito, a sessão nasce no servidor,
 * o cookie fica para trás, e a pessoa cai de volta na tela de login. Ela clica
 * no link de novo, ele já foi gasto, e a tela acusa "link expirado" — apontando
 * para o lugar errado. Medido em 08/09: cinco sessões criadas para o mesmo
 * convidado, nenhuma chegou ao navegador dele.
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

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;

  const { supabase, aplicar } = criarClienteDeRota(request);

  if (tokenHash && tipo && TIPOS.has(tipo)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
    // Recuperação de senha termina na tela que troca a senha; todo o resto
    // termina na entrada do painel.
    const destino = tipo === "recovery" ? "/nova-senha" : "/";
    if (!error) {
      return aplicar(NextResponse.redirect(new URL(destino, origin), { status: 303 }));
    }

    // ── O TOKEN NÃO VALEU. ISSO NEM SEMPRE É FALHA ───────────────────────────
    // O link vale uma vez, e este endereço é aberto mais de uma vez por visita:
    // pré-carregamento do navegador, o aplicativo de e-mail conferindo o
    // endereço, ou a pessoa dando F5. Quem já está com a sessão no cookie não
    // precisa de token nenhum, e mandar essa pessoa para a tela de erro é
    // mentir para ela. Sem sessão válida, cai na tela de erro como antes.
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      return aplicar(NextResponse.redirect(new URL(destino, origin), { status: 303 }));
    }
  }

  // Expirado, já usado ou inválido: a tela de login explica, sem dizer qual
  // dos três. Distinguir ajudaria só quem está testando links alheios.
  return aplicar(
    NextResponse.redirect(new URL("/login?link=expirado", origin), { status: 303 }),
  );
}
