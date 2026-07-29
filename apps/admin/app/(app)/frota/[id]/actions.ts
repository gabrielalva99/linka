"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAction } from "@/lib/audit";
import { getActiveTenant } from "@/lib/tenant";
import { podeOperarAgora } from "@/lib/perms";
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
  await logAction("comando", "device", deviceId, { comando: command });
  revalidatePath(`/frota/${deviceId}`);
}

/**
 * Remove um app do aparelho.
 *
 * O comando carrega o alvo ("uninstall:com.exemplo.jogo") em vez de existir um
 * comando por app. App de fábrica o Android não deixa remover: nesse caso o
 * aparelho esconde da gaveta e responde dizendo o que fez, em vez de fingir.
 */
export async function uninstallApp(deviceId: string, pkg: string) {
  if (!/^[a-zA-Z0-9._]+$/.test(pkg)) return;
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("devices")
    .update({ pending_command: `uninstall:${pkg}` })
    .eq("id", deviceId);
  await logAction("remover_app", "device", deviceId, { app: pkg });
  revalidatePath(`/frota/${deviceId}`);
}

/** Pede a lista de apps agora, sem esperar a próxima hora. */
export async function refreshApps(deviceId: string) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("devices")
    .update({ pending_command: "inventory_now" })
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

/**
 * Tira o aparelho de operação: roubado, quebrado, devolvido.
 *
 * O que isso resolve: hoje ele aparece como "fora do ar" todo dia, para sempre,
 * e não há como fechar o aviso. Alerta que não fecha é o jeito mais rápido de
 * ensinar a equipe a ignorar a tela de problemas — e aí o aparelho que caiu de
 * verdade some no meio do ruído.
 *
 * NÃO apaga nada. O que ele mediu enquanto estava na loja aconteceu, e relatório
 * de mês passado não pode mudar porque o aparelho sumiu ontem. Também não mexe
 * no token: se ele voltar a se conectar, aparece na lista de arquivados como
 * "visto agora" — que é justamente o que interessa saber de um aparelho roubado.
 */
export async function arquivarAparelho(deviceId: string, motivo: string) {
  if (!(await podeOperarAgora())) {
    return { ok: false as const, error: "Sem permissão." };
  }
  const limpo = motivo.trim();
  if (!limpo) {
    return { ok: false as const, error: "Diga o motivo (roubado, quebrado, devolvido)." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("devices")
    .update({
      is_active: false,
      archived_at: new Date().toISOString(),
      archive_reason: limpo,
    })
    .eq("id", deviceId);
  if (error) return { ok: false as const, error: "Não consegui arquivar." };

  await logAction("device.archive", "device", deviceId, { motivo: limpo });
  revalidatePath("/frota");
  revalidatePath(`/frota/${deviceId}`);
  return { ok: true as const };
}

/** Devolve o aparelho à operação. Volta a ser cobrado como todos os outros. */
export async function desarquivarAparelho(deviceId: string) {
  if (!(await podeOperarAgora())) {
    return { ok: false as const, error: "Sem permissão." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("devices")
    .update({ is_active: true, archived_at: null, archive_reason: null })
    .eq("id", deviceId);
  if (error) return { ok: false as const, error: "Não consegui reativar." };

  await logAction("device.unarchive", "device", deviceId);
  revalidatePath("/frota");
  revalidatePath(`/frota/${deviceId}`);
  return { ok: true as const };
}
