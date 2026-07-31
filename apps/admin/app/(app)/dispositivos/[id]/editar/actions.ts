"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EditDeviceState = { status: "idle" | "dup" | "error" };

const emptyToNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
};

/** Corrige o cadastro de um aparelho já existente (código, modelo, loja, posição). */
export async function updateDevice(
  _prev: EditDeviceState,
  formData: FormData,
): Promise<EditDeviceState> {
  const id = String(formData.get("device_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return { status: "error" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("devices")
    .update({
      name,
      code: emptyToNull(formData.get("code")),
      model_id: emptyToNull(formData.get("model_id")),
      store_id: emptyToNull(formData.get("store_id")),
      position_id: emptyToNull(formData.get("position_id")),
      platform: String(formData.get("platform") ?? "android"),
      device_type: String(formData.get("device_type") ?? "smartphone"),
      imei: emptyToNull(formData.get("imei")),
      // Checkbox desmarcada não vem no formulário: a ausência É o "false".
      exclude_from_reports: formData.get("exclude_from_reports") != null,
    })
    .eq("id", id);

  if (error) return { status: error.code === "23505" ? "dup" : "error" };

  revalidatePath("/dispositivos");
  revalidatePath(`/dispositivos/${id}`);
  redirect(`/dispositivos/${id}`);
}
