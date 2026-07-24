"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTenant } from "@/lib/tenant";

export type CreateStoreState = { status: "idle" | "dup" | "error" };

const emptyToNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
};

export async function createStore(
  _prev: CreateStoreState,
  formData: FormData,
): Promise<CreateStoreState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { status: "error" };

  const tenant = await getActiveTenant();
  if (!tenant) return { status: "error" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("stores").insert({
    tenant_id: tenant.id,
    name,
    code: emptyToNull(formData.get("code")),
    chain_id: emptyToNull(formData.get("chain_id")),
    kind: String(formData.get("kind") ?? "other"),
    city: emptyToNull(formData.get("city")),
    state: emptyToNull(formData.get("state")),
    country: String(formData.get("country") ?? "BR"),
    timezone: String(formData.get("timezone") ?? "America/Sao_Paulo"),
  });

  if (error) return { status: error.code === "23505" ? "dup" : "error" };

  revalidatePath("/lojas");
  redirect("/lojas");
}
