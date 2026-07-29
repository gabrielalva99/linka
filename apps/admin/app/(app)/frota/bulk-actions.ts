"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { podeOperarAgora } from "@/lib/perms";
import { logAction } from "@/lib/audit";

/**
 * Define loja ou modelo para vários aparelhos de uma vez.
 *
 * Existe porque a conta não fecha de outro jeito: são 250 aparelhos chegando, e
 * corrigir a loja de um em um é 250 formulários preenchidos por quem nunca
 * esteve na loja. O caminho certo é o aparelho já entrar na loja pelo código do
 * kit; isto aqui é a rede de segurança para quando isso não acontece — visita
 * antes do cadastro da loja existir, código digitado errado, aparelho que mudou
 * de ponto.
 */
export async function definirEmMassa(
  ids: string[],
  alvo: { storeId?: string | null; modelId?: string | null },
) {
  if (!(await podeOperarAgora())) {
    return { ok: false as const, error: "Sem permissão." };
  }
  if (ids.length === 0) {
    return { ok: false as const, error: "Nenhum aparelho selecionado." };
  }

  const update: Record<string, unknown> = {};
  if (alvo.storeId !== undefined) {
    update.store_id = alvo.storeId;
    // A posição pertence à loja antiga: mantê-la faria o aparelho apontar para
    // uma gôndola de outro endereço. Trocar de loja apaga a posição, e quem
    // souber onde ele ficou preenche depois.
    update.position_id = null;
  }
  if (alvo.modelId !== undefined) update.model_id = alvo.modelId;
  if (Object.keys(update).length === 0) {
    return { ok: false as const, error: "Nada para alterar." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("devices")
    .update(update)
    .in("id", ids)
    .select("id");

  if (error) return { ok: false as const, error: "Não consegui salvar." };

  // Uma linha de auditoria com a lista inteira, e não uma por aparelho: é UMA
  // decisão de quem operou, e 250 registros iguais escondem as outras ações do
  // dia em vez de explicar esta.
  await logAction("devices.bulk_update", "device", undefined, {
    ids,
    ...update,
    total: data?.length ?? 0,
  });

  revalidatePath("/frota");
  return { ok: true as const, n: data?.length ?? 0 };
}
