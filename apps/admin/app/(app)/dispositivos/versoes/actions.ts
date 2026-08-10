"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAction } from "@/lib/audit";

export type PublishState =
  | { ok: true; version: string }
  | { ok: false; error: string }
  | { ok: null };

/** "0.17.0" — três números. Versão torta quebra a comparação do atualizador. */
const SEMVER = /^\d+\.\d+\.\d+$/;

/**
 * Registra a versão recém-enviada e a torna a versão da frota.
 *
 * O arquivo já subiu direto do navegador para o Storage (3,7 MB não passam por
 * server action). Aqui só entra o registro — e ele é o que a frota obedece.
 */
export async function publishRelease(
  _prev: PublishState,
  form: FormData,
): Promise<PublishState> {
  const version = String(form.get("version") ?? "").trim();
  const url = String(form.get("url") ?? "").trim();
  const notes = String(form.get("notes") ?? "").trim();

  if (!SEMVER.test(version)) {
    return { ok: false, error: "Versão precisa ser no formato 0.17.0." };
  }
  if (!url) return { ok: false, error: "Envie o arquivo APK primeiro." };

  const supabase = await createSupabaseServerClient();

  // Uma versão vale por vez: a anterior sai de cena antes de a nova entrar.
  // Ordem importa — o banco tem índice único garantindo que só exista uma atual.
  const { error: offErr } = await supabase
    .from("agent_releases")
    .update({ is_current: false })
    .eq("is_current", true);
  if (offErr) return { ok: false, error: "Não foi possível publicar." };

  // NÃO conta linhas de propósito, e aqui é seguro: INSERT barrado por RLS
  // ESTOURA (ao contrário de UPDATE e DELETE, que afetam zero linhas em
  // silêncio). Quem não pode publicar não passa daqui, então o UPDATE de
  // is_current logo acima — que seria silencioso — nunca fica órfão: ou os dois
  // acontecem, ou a função sai pelo erro antes de gravar a trilha.
  const { error } = await supabase.from("agent_releases").insert({
    version,
    url,
    notes: notes || null,
    is_current: true,
  });
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "Essa versão já existe." : "Não foi possível publicar.",
    };
  }

  await logAction("publicar_versao", "agent_release", undefined, { versao: version });
  revalidatePath("/dispositivos/versoes");
  return { ok: true, version };
}

/**
 * Volta a frota para uma versão anterior.
 *
 * Existe porque o atualizador só instala versão MAIOR: se a nova quebrar em
 * campo, apontar de volta não conserta os aparelhos que já atualizaram — mas
 * impede que o resto da frota vá junto. É contenção, não desfazimento.
 */
export async function makeCurrent(id: string) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("agent_releases")
    .update({ is_current: false })
    .eq("is_current", true);
  await supabase.from("agent_releases").update({ is_current: true }).eq("id", id);
  revalidatePath("/dispositivos/versoes");
}
