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
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  startTime: string | null;
  endTime: string | null;
  rotationSeconds: number;
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
    name,
    startsOn: emptyToNull(formData.get("starts_on")),
    endsOn: emptyToNull(formData.get("ends_on")),
    startTime: emptyToNull(formData.get("start_time")),
    endTime: emptyToNull(formData.get("end_time")),
    rotationSeconds:
      Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : 1200,
    items,
    scope: String(formData.get("scope") ?? "tenant"),
    targetId: emptyToNull(formData.get("target_id")),
  };
}

/**
 * Salvar é uma escrita só, no banco.
 *
 * Eram cinco — campanha, apagar vídeos, apagar alvo, gravar vídeos, gravar alvo —
 * e cada uma valia na hora. Entre apagar e regravar os vídeos a campanha ficava
 * sem nenhum, e o aparelho que perguntasse nesse instante recebia lista vazia e
 * apagava a vitrine na loja. Aqui as cinco acontecem juntas ou nenhuma acontece:
 * quem lê vê a campanha inteira antiga ou a inteira nova, nunca o meio.
 */
async function salvar(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  campaignId: string | null,
  parsed: Parsed,
) {
  return supabase.rpc("salvar_campanha", {
    p_campaign_id: campaignId,
    p_tenant_id: tenantId,
    p_nome: parsed.name,
    p_starts_on: parsed.startsOn,
    p_ends_on: parsed.endsOn,
    p_start_time: parsed.startTime,
    p_end_time: parsed.endTime,
    p_rotation: parsed.rotationSeconds,
    p_itens: parsed.items.map((item) => ({
      media_id: item.mediaId,
      fit_mode: item.fitMode,
    })),
    p_scope: parsed.scope,
    p_chain_id: parsed.scope === "chain" ? parsed.targetId : null,
    p_store_id: parsed.scope === "store" ? parsed.targetId : null,
    p_device_id: parsed.scope === "device" ? parsed.targetId : null,
  });
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
  // Campanha pela metade deixou de ser possível: ou entra inteira, ou não entra.
  const { error } = await salvar(supabase, tenant.id, null, parsed);
  if (error) return { status: "error" };

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
  // Lista e alvo continuam sendo reescritos por inteiro — mas agora junto com a
  // campanha, numa transação só, para nenhum aparelho pegar a campanha vazia.
  const { error } = await salvar(supabase, tenant.id, id, parsed);
  if (error) return { status: "error" };

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
  // A TRILHA VEM DEPOIS DA EXCLUSÃO, e antes vinha antes.
  //
  // Registrar primeiro grava "campanha excluída" mesmo quando a exclusão não
  // acontece — e o DELETE barrado por RLS não acontece em silêncio: afeta zero
  // linhas e volta sem erro. Um papel de leitura chamando esta ação deixava na
  // auditoria uma exclusão que nunca houve, com a campanha ainda no ar.
  const { error, count } = await supabase
    .from("campaigns")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) {
    return { ok: false as const, error: "Não foi possível excluir a campanha." };
  }
  if ((count ?? 0) === 0) {
    return { ok: false as const, error: "Sem permissão para excluir esta campanha." };
  }
  await logAction("excluir_campanha", "campaign", id);
  revalidatePath("/campanhas");
  return { ok: true as const };
}
