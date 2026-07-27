"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTenant } from "@/lib/tenant";
import type { ContentFit } from "@linka/shared";

/**
 * Enfileira um comando para o aparelho. Ele chega na resposta do próximo
 * heartbeat (até 60s) e só sai da fila quando o aparelho confirma execução.
 */
export async function sendCommand(
  deviceId: string,
  command: "deprovision" | "debug_off" | "debug_on" | "debug_probe" | "cleanup_now",
) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("devices")
    .update({ pending_command: command })
    .eq("id", deviceId);
  revalidatePath(`/frota/${deviceId}`);
}

/** Bloquear Ajustes e Play Store — fecha o caminho para criar senha de tela. */
export async function setBlockSettings(deviceId: string, blocked: boolean) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("devices")
    .update({ block_settings: blocked })
    .eq("id", deviceId);
  revalidatePath(`/frota/${deviceId}`);
}

/** Horário e liga/desliga da faxina diária (horário local do aparelho). */
export async function setCleanup(deviceId: string, enabled: boolean, time: string) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("devices")
    .update({ cleanup_enabled: enabled, cleanup_time: time })
    .eq("id", deviceId);
  revalidatePath(`/frota/${deviceId}`);
}

/** Tempo fora do app antes de a vitrine voltar sozinha. */
export async function setIdleReturn(deviceId: string, seconds: number) {
  const value = Math.min(3600, Math.max(5, Math.round(seconds)));
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("devices")
    .update({ idle_return_seconds: value })
    .eq("id", deviceId);
  revalidatePath(`/frota/${deviceId}`);
}

/** Devolve o aparelho ao controle das campanhas (tira o vídeo fixado). */
export async function unpinContent(deviceId: string) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("devices")
    .update({ content_url: null, content_fit: null })
    .eq("id", deviceId);
  revalidatePath(`/frota/${deviceId}`);
}

/**
 * Enquadramento só deste aparelho (nulo volta a seguir o padrão do arquivo).
 * A tela de cada modelo corta de um jeito — o ajuste não pode ser sempre global.
 */
export async function setDeviceFit(deviceId: string, fit: ContentFit | null) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("devices").update({ content_fit: fit }).eq("id", deviceId);
  revalidatePath(`/frota/${deviceId}`);
}

export type AssignState = { ok: boolean };

/** Define (ou limpa) o conteúdo que o aparelho exibe. */
export async function assignContent(
  _prev: AssignState,
  formData: FormData,
): Promise<AssignState> {
  const deviceId = String(formData.get("device_id") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  if (!deviceId) return { ok: false };

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("devices")
    .update({ content_url: url.length > 0 ? url : null })
    .eq("id", deviceId);
  revalidatePath(`/frota/${deviceId}`);
  return { ok: true };
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
