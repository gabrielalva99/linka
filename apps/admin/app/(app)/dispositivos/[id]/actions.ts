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
  // CONTA AS LINHAS. UPDATE barrado por RLS não estoura: afeta zero linhas e
  // volta sem erro. Sem isto, quem não pode recebe "feito" e a trilha grava um
  // fato que não aconteceu — e a trilha é justamente a defesa contra "o aparelho
  // já estava assim quando eu cheguei".
  const { count } = await supabase
    .from("devices")
    .update({ pending_command: command }, { count: "exact" })
    .eq("id", deviceId);
  if ((count ?? 0) === 0) {
    return { ok: false as const, error: "Sem permissão para enviar comando." };
  }
  await logAction("comando", "device", deviceId, { comando: command });
  revalidatePath(`/dispositivos/${deviceId}`);
  return { ok: true as const };
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
  // CONTA AS LINHAS. UPDATE barrado por RLS não estoura: afeta zero linhas e
  // volta sem erro. Sem isto, quem não pode recebe "feito" e a trilha grava um
  // fato que não aconteceu — e a trilha é justamente a defesa contra "o aparelho
  // já estava assim quando eu cheguei".
  const { count } = await supabase
    .from("devices")
    .update({ pending_command: `uninstall:${pkg}` }, { count: "exact" })
    .eq("id", deviceId);
  if ((count ?? 0) === 0) {
    return { ok: false as const, error: "Sem permissão para remover aplicativo." };
  }
  await logAction("remover_app", "device", deviceId, { app: pkg });
  revalidatePath(`/dispositivos/${deviceId}`);
  return { ok: true as const };
}

/** Pede a lista de apps agora, sem esperar a próxima hora. */
export async function refreshApps(deviceId: string) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("devices")
    .update({ pending_command: "inventory_now" })
    .eq("id", deviceId);
  revalidatePath(`/dispositivos/${deviceId}`);
}

/** Bloquear Ajustes e Play Store — fecha o caminho para criar senha de tela. */
export async function setBlockSettings(deviceId: string, blocked: boolean) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("devices")
    .update({ block_settings: blocked })
    .eq("id", deviceId);
  revalidatePath(`/dispositivos/${deviceId}`);
}

/** Horário e liga/desliga da faxina diária (horário local do aparelho). */
export async function setCleanup(deviceId: string, enabled: boolean, time: string) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("devices")
    .update({ cleanup_enabled: enabled, cleanup_time: time })
    .eq("id", deviceId);
  revalidatePath(`/dispositivos/${deviceId}`);
}

/** Tempo fora do app antes de a vitrine voltar sozinha. */
export async function setIdleReturn(deviceId: string, seconds: number) {
  const value = Math.min(3600, Math.max(5, Math.round(seconds)));
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("devices")
    .update({ idle_return_seconds: value })
    .eq("id", deviceId);
  revalidatePath(`/dispositivos/${deviceId}`);
}

/** Devolve o aparelho ao controle das campanhas (tira o vídeo fixado). */
export async function unpinContent(deviceId: string) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("devices")
    .update({ content_url: null, content_fit: null })
    .eq("id", deviceId);
  revalidatePath(`/dispositivos/${deviceId}`);
}

/**
 * Enquadramento só deste aparelho (nulo volta a seguir o padrão do arquivo).
 * A tela de cada modelo corta de um jeito — o ajuste não pode ser sempre global.
 */
export async function setDeviceFit(deviceId: string, fit: ContentFit | null) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("devices").update({ content_fit: fit }).eq("id", deviceId);
  revalidatePath(`/dispositivos/${deviceId}`);
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
  revalidatePath(`/dispositivos/${deviceId}`);
  return { ok: true };
}

/** Registra um arquivo enviado ao Storage na biblioteca e já o aplica no aparelho. */
export async function addMedia(input: {
  deviceId: string;
  name: string;
  path: string;
  contentType: string;
  size: number;
  width?: number;
  height?: number;
}) {
  const tenant = await getActiveTenant();
  if (!tenant) return;

  // Mesma trava do envio pela biblioteca: o caminho tem que ser da pasta deste
  // cliente, e a URL é derivada dele no servidor. Aceitar a URL que o navegador
  // manda era confiar em quem chama para dizer onde o arquivo mora.
  if (!input.path.startsWith(`${tenant.id}/`)) return;

  // A resolução vem do navegador, então é entrada de fora e passa pela mesma
  // régua de qualquer entrada: número inteiro, positivo e dentro do razoável.
  // Valor esquisito vira nulo em vez de erro — a mídia continua servindo, só
  // não participa da escolha por formato.
  const dimensao = (v: number | undefined) =>
    typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 20000 ? v : null;
  const width = dimensao(input.width);
  const height = dimensao(input.height);

  const supabase = await createSupabaseServerClient();
  const { data: publica } = supabase.storage.from("content").getPublicUrl(input.path);
  await supabase.from("media_assets").insert({
    tenant_id: tenant.id,
    name: input.name,
    storage_path: input.path,
    url: publica.publicUrl,
    content_type: input.contentType,
    size_bytes: input.size,
    // As duas juntas ou nenhuma: só a largura não decide formato nenhum.
    width: width && height ? width : null,
    height: width && height ? height : null,
  });
  await supabase
    .from("devices")
    .update({ content_url: publica.publicUrl })
    .eq("id", input.deviceId);
  revalidatePath(`/dispositivos/${input.deviceId}`);
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
  // CONTA AS LINHAS. UPDATE barrado por RLS não estoura: afeta zero linhas e
  // volta sem erro. Sem isto, quem não pode recebe "feito" e a trilha grava um
  // fato que não aconteceu — e a trilha é justamente a defesa contra "o aparelho
  // já estava assim quando eu cheguei".
  const { error, count } = await supabase
    .from("devices")
    .update(
      {
        is_active: false,
        archived_at: new Date().toISOString(),
        archive_reason: limpo,
      },
      { count: "exact" },
    )
    .eq("id", deviceId);
  if (error) return { ok: false as const, error: "Não consegui arquivar." };
  if ((count ?? 0) === 0) {
    return { ok: false as const, error: "Sem permissão para arquivar este aparelho." };
  }

  await logAction("device.archive", "device", deviceId, { motivo: limpo });
  revalidatePath("/dispositivos");
  revalidatePath(`/dispositivos/${deviceId}`);
  return { ok: true as const };
}

/** Devolve o aparelho à operação. Volta a ser cobrado como todos os outros. */
export async function desarquivarAparelho(deviceId: string) {
  if (!(await podeOperarAgora())) {
    return { ok: false as const, error: "Sem permissão." };
  }
  const supabase = await createSupabaseServerClient();
  // CONTA AS LINHAS. UPDATE barrado por RLS não estoura: afeta zero linhas e
  // volta sem erro. Sem isto, quem não pode recebe "feito" e a trilha grava um
  // fato que não aconteceu — e a trilha é justamente a defesa contra "o aparelho
  // já estava assim quando eu cheguei".
  const { error, count } = await supabase
    .from("devices")
    .update(
      { is_active: true, archived_at: null, archive_reason: null },
      { count: "exact" },
    )
    .eq("id", deviceId);
  if (error) return { ok: false as const, error: "Não consegui reativar." };
  if ((count ?? 0) === 0) {
    return { ok: false as const, error: "Sem permissão para reativar este aparelho." };
  }

  await logAction("device.unarchive", "device", deviceId);
  revalidatePath("/dispositivos");
  revalidatePath(`/dispositivos/${deviceId}`);
  return { ok: true as const };
}

/**
 * Manda o aparelho tentar a atualização de novo.
 *
 * O aparelho desiste depois de três recusas e grava o motivo. O contador é por
 * versão, e não havia nada capaz de zerá-lo: um download que falhou três vezes
 * significava um técnico dirigindo até a loja. Com 250 aparelhos, isso ia
 * acontecer toda semana.
 *
 * Limpa o aviso no painel na mesma hora, porque o aviso é sobre a desistência
 * anterior — deixá-lo na tela faria a pessoa clicar duas, três vezes achando que
 * o botão não funcionou.
 */
export async function tentarAtualizarDeNovo(deviceId: string) {
  if (!(await podeOperarAgora())) {
    return { ok: false as const, error: "Sem permissão." };
  }
  const supabase = await createSupabaseServerClient();
  // CONTA AS LINHAS. UPDATE barrado por RLS não estoura: afeta zero linhas e
  // volta sem erro. Sem isto, quem não pode recebe "feito" e a trilha grava um
  // fato que não aconteceu — e a trilha é justamente a defesa contra "o aparelho
  // já estava assim quando eu cheguei".
  const { error, count } = await supabase
    .from("devices")
    .update(
      { pending_command: "update_retry", update_error: null },
      { count: "exact" },
    )
    .eq("id", deviceId);
  if (error) return { ok: false as const, error: "Não consegui enviar." };
  if ((count ?? 0) === 0) {
    return { ok: false as const, error: "Sem permissão para enviar comando." };
  }

  await logAction("atualizar_de_novo", "device", deviceId);
  revalidatePath(`/dispositivos/${deviceId}`);
  revalidatePath("/dispositivos");
  return { ok: true as const };
}

/**
 * Diz quem retirou este aparelho da vitrine.
 *
 * A pergunta saiu do aparelho em 24/08 (ver `retirada-card.tsx`). O aparelho
 * conta o FATO e a HORA; quem foi é dito aqui, por alguém autenticado.
 *
 * SÓ PREENCHE UMA VEZ. A condição `is null` no update não é detalhe: registro
 * que se reescreve sem rastro não sustenta a conversa para a qual ele existe.
 * Correção passa por quem administra a conta, e fica na trilha.
 */
export async function identificarRetirada(
  deviceId: string,
  quem: string,
  cargo: string,
) {
  if (!(await podeOperarAgora())) {
    return { ok: false as const, error: "Sem permissão." };
  }
  const nome = quem.trim();
  if (nome.length < 3) {
    return { ok: false as const, error: "Escreva quem retirou o aparelho." };
  }

  const supabase = await createSupabaseServerClient();
  // CONTA AS LINHAS. UPDATE barrado por RLS não estoura: afeta zero linhas e
  // volta sem erro. Aqui ele também protege a segunda escrita, que é o ponto.
  const { error, count } = await supabase
    .from("devices")
    .update(
      {
        retirado_por: nome.slice(0, 120),
        retirado_cargo: cargo.trim().slice(0, 120) || null,
      },
      { count: "exact" },
    )
    .eq("id", deviceId)
    .not("retirado_em", "is", null)
    .is("retirado_por", null);

  if (error) return { ok: false as const, error: "Não consegui registrar." };
  if ((count ?? 0) === 0) {
    return {
      ok: false as const,
      error: "Este aparelho não está retirado, ou já foi identificado.",
    };
  }

  await logAction("identificar_retirada", "device", deviceId, { quem: nome });
  revalidatePath(`/dispositivos/${deviceId}`);
  return { ok: true as const };
}
