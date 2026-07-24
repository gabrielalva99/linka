"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  | { ok: false; reason: "failed" };

/**
 * Remove um vídeo da biblioteca (arquivo + registro).
 * Bloqueia se algum aparelho estiver exibindo — apagar deixaria a tela vazia na loja.
 */
export async function deleteMedia(id: string): Promise<DeleteState> {
  const supabase = await createSupabaseServerClient();

  const { data: asset } = await supabase
    .from("media_assets")
    .select("id, url, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!asset) return { ok: false, reason: "failed" };

  const { count } = await supabase
    .from("devices")
    .select("id", { count: "exact", head: true })
    .eq("content_url", asset.url);
  if ((count ?? 0) > 0) return { ok: false, reason: "in_use", count: count ?? 0 };

  await supabase.storage.from("content").remove([asset.storage_path]);
  const { error } = await supabase.from("media_assets").delete().eq("id", id);
  if (error) return { ok: false, reason: "failed" };

  revalidatePath("/biblioteca");
  return { ok: true };
}
