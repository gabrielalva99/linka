"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAction } from "@/lib/audit";
import type { ContentFit } from "@linka/shared";

/** Define como o vídeo é enquadrado na tela (vale para todo aparelho que o exibir). */
export async function setMediaFit(id: string, fit: ContentFit, deviceId?: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("media_assets").update({ fit_mode: fit }).eq("id", id);
  revalidatePath("/biblioteca");
  if (deviceId) revalidatePath(`/frota/${deviceId}`);
}

export type DeleteState =
  | { ok: true }
  | { ok: false; reason: "in_use"; count: number }
  | { ok: false; reason: "in_campaign"; count: number }
  | { ok: false; reason: "failed" };

/**
 * Remove um vídeo da biblioteca (arquivo e registro).
 *
 * A ORDEM importa e antes estava invertida: o arquivo era apagado do
 * armazenamento ANTES de o banco recusar a exclusão. Um vídeo usado só em
 * campanha passava na checagem, o arquivo sumia, o banco recusava por causa da
 * campanha, e a tela dizia "não foi possível excluir". O operador achava que
 * nada tinha acontecido, mas a campanha continuava no ar apontando para um
 * arquivo que não existe mais: tela preta na loja.
 *
 * Agora o registro sai primeiro. Se o banco recusar, o arquivo continua lá e
 * nada quebrou. O arquivo só é apagado depois que o banco confirmou.
 */
export async function deleteMedia(id: string): Promise<DeleteState> {
  const supabase = await createSupabaseServerClient();

  const { data: asset } = await supabase
    .from("media_assets")
    .select("id, url, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!asset) return { ok: false, reason: "failed" };

  // "Em uso" é só quem está em operação: aparelho arquivado não exibe nada, e
  // contá-lo impedia apagar um vídeo que na prática já saiu do ar em todo lugar.
  const { count } = await supabase
    .from("devices")
    .select("id", { count: "exact", head: true })
    .eq("content_url", asset.url)
    .eq("is_active", true);
  if ((count ?? 0) > 0) return { ok: false, reason: "in_use", count: count ?? 0 };

  // Campanha também segura o vídeo. O banco já impede pela chave estrangeira,
  // mas quem apaga precisa ler POR QUE não deu, e não um "falhou" seco.
  const { count: emCampanha } = await supabase
    .from("campaign_items")
    .select("campaign_id", { count: "exact", head: true })
    .eq("media_id", id);
  if ((emCampanha ?? 0) > 0) {
    return { ok: false, reason: "in_campaign", count: emCampanha ?? 0 };
  }

  const { error } = await supabase.from("media_assets").delete().eq("id", id);
  if (error) return { ok: false, reason: "failed" };
  await supabase.storage.from("content").remove([asset.storage_path]);
  await logAction("excluir_video", "media_asset", id);

  revalidatePath("/biblioteca");
  return { ok: true };
}
