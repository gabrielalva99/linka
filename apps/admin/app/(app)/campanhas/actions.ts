"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTenant } from "@/lib/tenant";

export type CampaignState = { status: "idle" | "error" };

const emptyToNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
};

/** Cria a campanha e o alvo (onde ela vale). */
export async function createCampaign(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const name = String(formData.get("name") ?? "").trim();
  const mediaId = emptyToNull(formData.get("media_id"));
  const scope = String(formData.get("scope") ?? "tenant");
  if (!name || !mediaId) return { status: "error" };

  const tenant = await getActiveTenant();
  if (!tenant) return { status: "error" };

  const supabase = await createSupabaseServerClient();
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      tenant_id: tenant.id,
      name,
      media_id: mediaId,
      fit_mode: emptyToNull(formData.get("fit_mode")),
      starts_on: emptyToNull(formData.get("starts_on")),
      ends_on: emptyToNull(formData.get("ends_on")),
      start_time: emptyToNull(formData.get("start_time")),
      end_time: emptyToNull(formData.get("end_time")),
    })
    .select("id")
    .single();
  if (error || !campaign) return { status: "error" };

  // O alvo escolhido determina qual coluna preencher (o banco valida o formato).
  const targetId = emptyToNull(formData.get("target_id"));
  const target: Record<string, unknown> = {
    tenant_id: tenant.id,
    campaign_id: campaign.id,
    scope,
  };
  if (scope === "chain") target.chain_id = targetId;
  if (scope === "store") target.store_id = targetId;
  if (scope === "device") target.device_id = targetId;
  if (scope !== "tenant" && !targetId) return { status: "error" };

  const { error: targetError } = await supabase.from("campaign_targets").insert(target);
  if (targetError) {
    await supabase.from("campaigns").delete().eq("id", campaign.id);
    return { status: "error" };
  }

  revalidatePath("/campanhas");
  redirect("/campanhas");
}

export async function toggleCampaign(id: string, active: boolean) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("campaigns").update({ is_active: active }).eq("id", id);
  revalidatePath("/campanhas");
}

export async function deleteCampaign(id: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("campaigns").delete().eq("id", id);
  revalidatePath("/campanhas");
}
