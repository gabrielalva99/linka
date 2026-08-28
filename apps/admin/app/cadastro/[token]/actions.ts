"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Auto-cadastro de quem recebe aviso da loja.
 *
 * FORA DA AREA LOGADA de propósito: quem preenche é o vendedor no balcão, que
 * não tem e nunca vai ter conta no painel. Pedir login aqui seria garantir que
 * ninguém se cadastra.
 *
 * O que autoriza é o token do convite, validado dentro do banco. Esta camada
 * não decide nada: passa adiante e devolve o que o banco respondeu.
 */
export type CadastroState = {
  ok: boolean;
  erro: string | null;
  /** Codigo de uso unico que vai no link do Telegram, para o bot nao perguntar o celular. */
  vinculo?: string | null;
};

export async function cadastrar(
  _anterior: CadastroState,
  form: FormData,
): Promise<CadastroState> {
  const token = String(form.get("token") ?? "");
  const nome = String(form.get("nome") ?? "");
  const celular = String(form.get("celular") ?? "");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cadastrar_contato", {
    p_token: token,
    p_nome: nome,
    p_celular: celular,
  });

  if (error) return { ok: false, erro: "falhou" };
  const r = (data ?? {}) as { ok?: boolean; erro?: string; vinculo?: string };
  return r.ok
    ? { ok: true, erro: null, vinculo: r.vinculo ?? null }
    : { ok: false, erro: r.erro ?? "falhou" };
}
