"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTenant } from "@/lib/tenant";

export type CreateDeviceState = { status: "idle" | "dup" | "error" };

const emptyToNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
};

export async function createDevice(
  _prev: CreateDeviceState,
  formData: FormData,
): Promise<CreateDeviceState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { status: "error" };

  const tenant = await getActiveTenant();
  if (!tenant) return { status: "error" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("devices").insert({
    tenant_id: tenant.id,
    name,
    code: emptyToNull(formData.get("code")),
    model_id: emptyToNull(formData.get("model_id")),
    store_id: emptyToNull(formData.get("store_id")),
    position_id: emptyToNull(formData.get("position_id")),
    platform: String(formData.get("platform") ?? "android"),
    device_type: String(formData.get("device_type") ?? "smartphone"),
    imei: emptyToNull(formData.get("imei")),
  });

  if (error) return { status: error.code === "23505" ? "dup" : "error" };

  revalidatePath("/dispositivos");
  redirect("/dispositivos");
}
