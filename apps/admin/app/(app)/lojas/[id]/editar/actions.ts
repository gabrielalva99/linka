"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAction } from "@/lib/audit";

export type EditStoreState = { status: "idle" | "dup" | "error" };

const vazioParaNulo = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
};

/**
 * Corrige o cadastro de uma loja.
 *
 * O horário de funcionamento não é detalhe de cadastro: ele manda no
 * comportamento dos aparelhos daquela loja. Com a loja aberta, uma vitrine
 * apagada acende sozinha; com a loja fechada, fica quieta para não queimar tela
 * e bateria a noite inteira. E é ele que recorta o denominador do relatório.
 *
 * Até agora só dava para definir na criação. Horário errado era permanente, e
 * uma loja que muda de horário no Natal não tinha conserto nenhum.
 */
export async function updateStore(
  _prev: EditStoreState,
  formData: FormData,
): Promise<EditStoreState> {
  const id = String(formData.get("store_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return { status: "error" };

  const abre = String(formData.get("opens_at") || "09:00");
  const fecha = String(formData.get("closes_at") || "22:00");
  // Expediente que vira a noite não existe no varejo e quebraria o recorte do
  // relatório em silêncio: o intervalo ficaria vazio e todo dado sumiria.
  if (abre >= fecha) return { status: "error" };

  const supabase = await createSupabaseServerClient();
  // Conta as linhas: UPDATE barrado por RLS afeta zero linhas e volta sem erro.
  const { error, count } = await supabase
    .from("stores")
    .update({
      name,
      code: vazioParaNulo(formData.get("code")),
      chain_id: vazioParaNulo(formData.get("chain_id")),
      kind: String(formData.get("kind") ?? "other"),
      city: vazioParaNulo(formData.get("city")),
      state: vazioParaNulo(formData.get("state")),
      country: String(formData.get("country") ?? "BR"),
      timezone: String(formData.get("timezone") ?? "America/Sao_Paulo"),
      opens_at: abre,
      closes_at: fecha,
    }, { count: "exact" })
    .eq("id", id);

  if (error) return { status: error.code === "23505" ? "dup" : "error" };
  if ((count ?? 0) === 0) return { status: "error" as const };

  await logAction("editar_loja", "store", id, { abre, fecha });
  revalidatePath("/lojas");
  revalidatePath(`/lojas/${id}`);
  redirect(`/lojas/${id}`);
}
