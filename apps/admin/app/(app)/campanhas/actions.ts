"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAction } from "@/lib/audit";
import { getActiveTenant } from "@/lib/tenant";

export type CampaignState = { status: "idle" | "error" };

const emptyToNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
};

type Item = { mediaId: string; fitMode: string | null };

type Parsed = {
  fields: Record<string, unknown>;
  items: Item[];
  scope: string;
  targetId: string | null;
};

function parse(formData: FormData): Parsed | null {
  const name = String(formData.get("name") ?? "").trim();
  // Os dois campos saem na mesma ordem das linhas do formulário.
  const mediaIds = formData.getAll("media_ids").map((v) => String(v));
  const fitModes = formData.getAll("fit_modes").map((v) => String(v));
  const items = mediaIds
    .map((mediaId, i) => ({
      mediaId,
      fitMode: fitModes[i] && fitModes[i].length > 0 ? fitModes[i] : null,
    }))
    .filter((item) => item.mediaId.length > 0);
  if (!name || items.length === 0) return null;

  const minutes = Number(formData.get("rotation_minutes") ?? 20);
  return {
    fields: {
      name,
      starts_on: emptyToNull(formData.get("starts_on")),
      ends_on: emptyToNull(formData.get("ends_on")),
      start_time: emptyToNull(formData.get("start_time")),
      end_time: emptyToNull(formData.get("end_time")),
      rotation_seconds:
        Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : 1200,
    },
    items,
    scope: String(formData.get("scope") ?? "tenant"),
    targetId: emptyToNull(formData.get("target_id")),
  };
}

function targetRow(
  tenantId: string,
  campaignId: string,
  scope: string,
  targetId: string | null,
) {
  const row: Record<string, unknown> = {
    tenant_id: tenantId,
    campaign_id: campaignId,
    scope,
  };
  if (scope === "chain") row.chain_id = targetId;
  if (scope === "store") row.store_id = targetId;
  if (scope === "device") row.device_id = targetId;
  return row;
}

export async function createCampaign(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const parsed = parse(formData);
  if (!parsed) return { status: "error" };
  if (parsed.scope !== "tenant" && !parsed.targetId) return { status: "error" };

  const tenant = await getActiveTenant();
  if (!tenant) return { status: "error" };

  const supabase = await createSupabaseServerClient();
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({ tenant_id: tenant.id, ...parsed.fields })
    .select("id")
    .single();
  if (error || !campaign) return { status: "error" };

  const { error: itemsError } = await supabase.from("campaign_items").insert(
    parsed.items.map((item, i) => ({
      tenant_id: tenant.id,
      campaign_id: campaign.id,
      media_id: item.mediaId,
      fit_mode: item.fitMode,
      position: i + 1,
    })),
  );
  const { error: targetError } = await supabase
    .from("campaign_targets")
    .insert(targetRow(tenant.id, campaign.id, parsed.scope, parsed.targetId));

  if (itemsError || targetError) {
    // Campanha pela metade é pior que campanha nenhuma.
    await supabase.from("campaigns").delete().eq("id", campaign.id);
    return { status: "error" };
  }

  revalidatePath("/campanhas");
  redirect("/campanhas");
}

export async function updateCampaign(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const id = String(formData.get("campaign_id") ?? "");
  const parsed = parse(formData);
  if (!id || !parsed) return { status: "error" };
  if (parsed.scope !== "tenant" && !parsed.targetId) return { status: "error" };

  const tenant = await getActiveTenant();
  if (!tenant) return { status: "error" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("campaigns").update(parsed.fields).eq("id", id);
  if (error) return { status: "error" };

  // Lista e alvo são reescritos: mais simples e sem estado intermediário estranho.
  await supabase.from("campaign_items").delete().eq("campaign_id", id);
  await supabase.from("campaign_targets").delete().eq("campaign_id", id);

  const { error: itemsError } = await supabase.from("campaign_items").insert(
    parsed.items.map((item, i) => ({
      tenant_id: tenant.id,
      campaign_id: id,
      media_id: item.mediaId,
      fit_mode: item.fitMode,
      position: i + 1,
    })),
  );
  const { error: targetError } = await supabase
    .from("campaign_targets")
    .insert(targetRow(tenant.id, id, parsed.scope, parsed.targetId));
  if (itemsError || targetError) return { status: "error" };

  revalidatePath("/campanhas");
  redirect("/campanhas");
}

export async function toggleCampaign(id: string, active: boolean) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("campaigns").update({ is_active: active }).eq("id", id);
  revalidatePath("/campanhas");
}

export async function deleteCampaign(id: string) {
  await logAction("excluir_campanha", "campaign", id);
  const supabase = await createSupabaseServerClient();
  await supabase.from("campaigns").delete().eq("id", id);
  revalidatePath("/campanhas");
}
