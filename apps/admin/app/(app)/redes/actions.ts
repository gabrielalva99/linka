"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTenant } from "@/lib/tenant";

export type CreateChainState = { status: "idle" | "ok" | "dup" | "error" };

export async function createChain(
  _prev: CreateChainState,
  formData: FormData,
): Promise<CreateChainState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { status: "error" };

  const tenant = await getActiveTenant();
  if (!tenant) return { status: "error" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("retail_chains")
    .insert({ tenant_id: tenant.id, name });

  if (error) return { status: error.code === "23505" ? "dup" : "error" };

  revalidatePath("/redes");
  return { status: "ok" };
}
