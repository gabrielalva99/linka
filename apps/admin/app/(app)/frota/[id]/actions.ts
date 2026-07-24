"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTenant } from "@/lib/tenant";

/** Define (ou limpa) o conteúdo que o aparelho exibe. */
export async function assignContent(formData: FormData) {
  const deviceId = String(formData.get("device_id") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  if (!deviceId) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("devices")
    .update({ content_url: url.length > 0 ? url : null })
    .eq("id", deviceId);
  revalidatePath(`/frota/${deviceId}`);
}

/** Registra um arquivo enviado ao Storage na biblioteca e já o aplica no aparelho. */
export async function addMedia(input: {
  deviceId: string;
  name: string;
  path: string;
  url: string;
  contentType: string;
  size: number;
}) {
  const tenant = await getActiveTenant();
  if (!tenant) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from("media_assets").insert({
    tenant_id: tenant.id,
    name: input.name,
    storage_path: input.path,
    url: input.url,
    content_type: input.contentType,
    size_bytes: input.size,
  });
  await supabase
    .from("devices")
    .update({ content_url: input.url })
    .eq("id", input.deviceId);
  revalidatePath(`/frota/${input.deviceId}`);
}
