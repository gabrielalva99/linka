"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTenant } from "@/lib/tenant";
import { logAction } from "@/lib/audit";

export type InviteState =
  | { ok: true; link: string; email: string; jaExistia?: boolean }
  | { ok: false; error: string }
  | { ok: null };

const ERROS: Record<string, string> = {
  sem_sessao: "Sua sessão expirou. Saia e entre de novo.",
  email_invalido: "E-mail inválido.",
  papel_invalido: "Escolha um tipo de acesso.",
  sem_permissao: "Você não pode convidar para este cliente.",
  papel_acima_do_seu: "Só o operador da plataforma concede acesso de agência.",
  nao_criou_usuario: "Não foi possível criar o acesso. Tente de novo.",
  nao_vinculou: "O acesso foi criado, mas não ficou ligado ao cliente. Avise o suporte.",
  nao_gerou_link: "O acesso foi criado, mas o link falhou. Use 'Gerar link de novo'.",
};

/**
 * Convida alguém para o painel.
 *
 * Chama a função no servidor do banco em vez de criar o usuário aqui: criar
 * conta exige a chave de serviço, e ela não pode viver no código do site.
 *
 * Devolve um LINK para você mandar por WhatsApp. Não é gambiarra por preguiça:
 * o domínio de e-mail ainda não está verificado, e um convite que depende de
 * infraestrutura que não existe é um convite que não funciona. Quando o e-mail
 * estiver de pé, a mesma função passa a enviar sozinha.
 */
export async function inviteUser(
  _prev: InviteState,
  form: FormData,
): Promise<InviteState> {
  const email = String(form.get("email") ?? "").trim();
  const role = String(form.get("role") ?? "");
  const tenant = await getActiveTenant();
  if (!tenant) return { ok: false, error: "Nenhum cliente ativo." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: ERROS.sem_sessao };

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    const r = await fetch(`${base}/functions/v1/invite-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      },
      body: JSON.stringify({ email, role, tenant_id: tenant.id }),
    });
    const body = await r.json();
    if (!r.ok || !body?.ok) {
      return { ok: false, error: ERROS[body?.error] ?? "Não foi possível convidar." };
    }
    revalidatePath("/usuarios");
    // Sem link quando a pessoa já tinha conta, e isso é de propósito: gerar um
    // link de acesso para conta que já existe é entregar a conta dela a quem
    // convidou. Ela entra pelo login normal, que manda o link para o e-mail
    // dela e para mais ninguém.
    return {
      ok: true,
      link: body.link ?? "",
      email: body.email ?? email,
      jaExistia: body.ja_existia === true,
    };
  } catch {
    return { ok: false, error: "Não foi possível convidar. Verifique a conexão." };
  }
}

/** Tira o acesso de alguém. O acesso some; o histórico de auditoria fica. */
export async function revokeAccess(userId: string, tenantId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false as const, error: "Não foi possível remover o acesso." };
  await logAction("remover_acesso", "membership", undefined, { usuario: userId });
  revalidatePath("/usuarios");
  return { ok: true as const };
}
