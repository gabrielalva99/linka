"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Só os tipos que o Supabase reconhece. Qualquer outra coisa é lixo ou
// tentativa, e não chega a tocar no Auth.
const TIPOS = new Set<EmailOtpType>([
  "magiclink",
  "recovery",
  "invite",
  "signup",
  "email",
  "email_change",
]);

/**
 * TROCA O TOKEN PELA SESSÃO, e só quando alguém CLICA.
 *
 * ── POR QUE É UMA AÇÃO DE FORMULÁRIO, e não a abertura da página ────────────
 * O token do e-mail vale uma vez. Enquanto quem trocava era a ABERTURA do
 * endereço, o link morria antes de chegar na pessoa: o verificador de links da
 * Microsoft abre o destino no momento do clique, para conferir se é golpe, e só
 * então solta o navegador para o mesmo lugar. Medido em 08/09 com um clique
 * cronometrado: `POST /verify` 200 às 02:40:21 e `POST /verify` 403 às 02:40:22,
 * as duas do nosso servidor. A pessoa recebia a segunda.
 *
 * Robô abre. Robô não clica. Por isso a troca mora aqui, atrás de um botão, e
 * não na abertura do endereço.
 *
 * ── E POR QUE SERVER ACTION, e não um endereço que responde a GET ───────────
 * Além do clique, esta é a via que grava a sessão no navegador de forma
 * confiável, a mesma do login por senha. Um endereço que responde e monta a
 * própria resposta precisa carregar os cookies na mão, e foi assim que a sessão
 * ficou nascendo no servidor sem nunca chegar em quem estava entrando.
 */
export async function entrarComToken(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const bruto = String(formData.get("type") ?? "");
  const tipo = TIPOS.has(bruto as EmailOtpType) ? (bruto as EmailOtpType) : null;

  if (!tokenHash || !tipo) redirect("/login?link=expirado");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });

  // Morto é morto, e a tela diz isso. Sem essa resposta a pessoa pede outro
  // link, que morre igual, e ela repete para sempre sem entender por quê.
  if (error) redirect("/login?link=expirado");

  // Recuperação de senha termina na tela que troca a senha; o resto entra
  // direto no painel.
  redirect(tipo === "recovery" ? "/nova-senha" : "/");
}
