import { NextResponse, type NextRequest } from "next/server";
import { criarClienteDeRota } from "@/lib/supabase/route";

/**
 * Sair do painel.
 *
 * Passa por `criarClienteDeRota` pelo mesmo motivo de `/auth/entrar`, e aqui o
 * defeito era pior: `signOut()` pede para APAGAR os cookies da sessão, e num
 * `NextResponse.redirect` montado à parte esse pedido ficava para trás. A
 * pessoa clicava em sair, era levada para a tela de login, e continuava com a
 * sessão viva no navegador. Em aparelho compartilhado de loja, isso é a conta
 * de uma pessoa aberta para a próxima.
 */
export async function POST(request: NextRequest) {
  const { supabase, aplicar } = criarClienteDeRota(request);
  await supabase.auth.signOut();
  return aplicar(
    NextResponse.redirect(new URL("/login", request.url), { status: 303 }),
  );
}
