import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Cliente Supabase para ROUTE HANDLER, com os cookies chegando ao navegador.
 *
 * ── POR QUE ISTO EXISTE, e por que não dá para usar o cliente comum ─────────
 * O cliente de `server.ts` grava a sessão no cookie store do Next. Isso basta em
 * Server Action, que é o caminho do login por senha. Num route handler que
 * termina com `NextResponse.redirect(...)`, não basta: a resposta é um objeto
 * novo, e sai sem os cookies que o Supabase pediu para gravar.
 *
 * O sintoma não parece de cookie nenhum. Medido em 08/09, no convite do Fábio:
 *
 *   auth.sessions do Fábio      5 criadas   0 usadas pelo navegador
 *   auth.sessions de todo resto              todas usadas
 *
 * Cada clique no link criava a sessão no Supabase de verdade (o /verify
 * respondia 200), o cookie ficava para trás, o navegador chegava ao painel sem
 * sessão e voltava para a tela de login. A pessoa clicava de novo, o link já
 * tinha sido gasto na primeira vez, e a tela dizia "link expirado". Três horas
 * perseguindo uma mensagem de expiração que nunca foi o problema.
 *
 * Ninguém tinha percebido porque quem já tem senha entra pela Server Action, que
 * grava certo. Só quem depende de link, ou seja, todo convidado novo, batia
 * nisso.
 *
 * ── COMO USAR ───────────────────────────────────────────────────────────────
 * Monte a resposta e passe por `aplicar` antes de devolvê-la. Toda saída do
 * handler precisa passar por ali, inclusive as de erro: é `aplicar` que carrega
 * a sessão para o navegador.
 */
export function criarClienteDeRota(request: NextRequest) {
  const paraGravar: CookieToSet[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          paraGravar.push(...cookiesToSet);
        },
      },
    },
  );

  function aplicar<T extends NextResponse>(resposta: T): T {
    for (const { name, value, options } of paraGravar) {
      resposta.cookies.set(name, value, options);
    }
    return resposta;
  }

  return { supabase, aplicar };
}
