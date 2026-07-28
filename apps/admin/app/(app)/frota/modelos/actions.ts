"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTenant } from "@/lib/tenant";
import { logAction } from "@/lib/audit";

export type CreateModelState = { status: "idle" | "ok" | "dup" | "error" };

export async function createModel(
  _prev: CreateModelState,
  formData: FormData,
): Promise<CreateModelState> {
  const name = String(formData.get("name") ?? "").trim();
  const line = String(formData.get("line") ?? "").trim() || null;
  if (!name) return { status: "error" };

  const tenant = await getActiveTenant();
  if (!tenant) return { status: "error" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("device_models")
    .insert({ tenant_id: tenant.id, name, line });

  if (error) return { status: error.code === "23505" ? "dup" : "error" };

  revalidatePath("/frota/modelos");
  return { status: "ok" };
}

/** Corrige o nome do modelo. Errado, ele aparecia na coluna Modelo da frota inteira. */
export async function renameModel(id: string, name: string, line: string) {
  const nome = name.trim();
  if (!nome) return { ok: false as const, error: "Digite um nome." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("device_models")
    .update({ name: nome, line: line.trim() || null })
    .eq("id", id);
  if (error) {
    return {
      ok: false as const,
      error: error.code === "23505" ? "Já existe um modelo com esse nome." : "Não foi possível salvar.",
    };
  }
  await logAction("renomear_modelo", "device_model", id, { nome });
  revalidatePath("/frota/modelos");
  revalidatePath("/frota");
  return { ok: true as const };
}

/**
 * Apaga o modelo, e só se nenhum aparelho estiver usando.
 *
 * Sem a trava, o banco zera o vínculo dos aparelhos em silêncio e a coluna
 * Modelo da frota passa a mostrar só o que o próprio aparelho reporta, sem
 * ninguém entender por que o catálogo sumiu.
 */
export async function deleteModel(id: string) {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("devices")
    .select("id", { count: "exact", head: true })
    .eq("model_id", id);
  if ((count ?? 0) > 0) {
    return { ok: false as const, error: `${count} aparelho(s) usam este modelo. Troque o modelo deles antes.` };
  }
  const { error } = await supabase.from("device_models").delete().eq("id", id);
  if (error) return { ok: false as const, error: "Não foi possível excluir." };
  await logAction("excluir_modelo", "device_model", id);
  revalidatePath("/frota/modelos");
  return { ok: true as const };
}
