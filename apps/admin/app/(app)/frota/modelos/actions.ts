"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTenant } from "@/lib/tenant";

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
