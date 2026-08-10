"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTenant } from "@/lib/tenant";
import { logAction } from "@/lib/audit";

export type CreatePositionState = { status: "idle" | "ok" | "error" };

export async function createPosition(
  _prev: CreatePositionState,
  formData: FormData,
): Promise<CreatePositionState> {
  const storeId = String(formData.get("store_id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!storeId || !label) return { status: "error" };

  const tenant = await getActiveTenant();
  if (!tenant) return { status: "error" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("positions")
    .insert({ tenant_id: tenant.id, store_id: storeId, label });

  if (error) return { status: "error" };

  revalidatePath(`/lojas/${storeId}`);
  return { status: "ok" };
}

/** Corrige o rótulo da posição. Antes, renomear "Mesa 3" exigia apagar e
 *  recriar, o que soltava todos os aparelhos que estavam ali. */
export async function renamePosition(id: string, label: string, storeId: string) {
  const limpo = label.trim();
  if (!limpo) return { ok: false as const, error: "Digite um nome." };
  const supabase = await createSupabaseServerClient();
  // Conta as linhas: UPDATE barrado por RLS afeta zero linhas e volta sem erro.
  const { error, count } = await supabase
    .from("positions")
    .update({ label: limpo }, { count: "exact" })
    .eq("id", id);
  if (error) return { ok: false as const, error: "Não foi possível salvar." };
  if ((count ?? 0) === 0) {
    return { ok: false as const, error: "Sem permissão para renomear esta posição." };
  }
  await logAction("renomear_posicao", "store", storeId, { posicao: limpo });
  revalidatePath(`/lojas/${storeId}`);
  return { ok: true as const };
}

/**
 * Apaga a posição, e só se não houver aparelho nela.
 *
 * Antes apagava calado. A chave estrangeira solta o vínculo dos aparelhos, e a
 * ficha deles passava a mostrar um traço no lugar da posição, sem ninguém
 * entender por quê. Quem está na loja procurando o aparelho "da mesa 3" fica
 * sem a informação que foi buscar.
 */
export async function deletePosition(id: string, storeId: string) {
  const supabase = await createSupabaseServerClient();
  // Posição de aparelho arquivado ainda segura a exclusão (chave estrangeira),
  // mas "mova antes de apagar" só faz sentido para quem está em operação. Sem
  // separar os dois, a pessoa procura na loja um aparelho que já foi recolhido.
  const [{ count }, { count: ativos }] = await Promise.all([
    supabase
      .from("devices")
      .select("id", { count: "exact", head: true })
      .eq("position_id", id),
    supabase
      .from("devices")
      .select("id", { count: "exact", head: true })
      .eq("position_id", id)
      .eq("is_active", true),
  ]);
  if ((count ?? 0) > 0) {
    const arquivados = (count ?? 0) - (ativos ?? 0);
    return {
      ok: false as const,
      error: ativos
        ? `${ativos} aparelho(s) estão nesta posição. Mova antes de apagar.`
        : `${arquivados} aparelho(s) arquivado(s) ainda apontam para esta posição. ` +
          `Ela não pode ser apagada sem perder de onde eles vinham no histórico.`,
    };
  }
  const { error } = await supabase.from("positions").delete().eq("id", id);
  if (error) return { ok: false as const, error: "Não foi possível excluir." };
  await logAction("excluir_posicao", "store", storeId);
  revalidatePath(`/lojas/${storeId}`);
  return { ok: true as const };
}
