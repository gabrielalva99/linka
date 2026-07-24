"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTenant } from "@/lib/tenant";

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

export async function deletePosition(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const storeId = String(formData.get("store_id") ?? "");
  if (!id) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from("positions").delete().eq("id", id);
  revalidatePath(`/lojas/${storeId}`);
}
