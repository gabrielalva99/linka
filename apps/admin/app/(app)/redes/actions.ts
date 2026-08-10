"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTenant } from "@/lib/tenant";
import { logAction } from "@/lib/audit";

export type CreateChainState = { status: "idle" | "ok" | "dup" | "error" };

export async function createChain(
  _prev: CreateChainState,
  formData: FormData,
): Promise<CreateChainState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { status: "error" };

  const tenant = await getActiveTenant();
  if (!tenant) return { status: "error" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("retail_chains")
    .insert({ tenant_id: tenant.id, name });

  if (error) return { status: error.code === "23505" ? "dup" : "error" };

  revalidatePath("/redes");
  return { status: "ok" };
}

/** Corrige o nome da rede. Nome errado aparecia em toda linha da lista de lojas. */
export async function renameChain(id: string, name: string) {
  const limpo = name.trim();
  if (!limpo) return { ok: false as const, error: "Digite um nome." };
  const supabase = await createSupabaseServerClient();
  // Conta as linhas: UPDATE barrado por RLS afeta zero linhas e volta sem erro.
  // Sem isto, quem não pode recebe "salvo" e a trilha grava o que não houve.
  //
  // O ERRO É CHECADO ANTES DA CONTAGEM, e a ordem importa: quando o UPDATE falha
  // de verdade (nome repetido, por exemplo) a contagem também vem zero, e checá-la
  // primeiro trocaria "Já existe uma rede com esse nome" por "sem permissão" —
  // mandando a pessoa procurar problema de acesso que não existe.
  const { error, count } = await supabase
    .from("retail_chains")
    .update({ name: limpo }, { count: "exact" })
    .eq("id", id);
  if (error) {
    return {
      ok: false as const,
      error: error.code === "23505" ? "Já existe uma rede com esse nome." : "Não foi possível salvar.",
    };
  }
  if ((count ?? 0) === 0) {
    return { ok: false as const, error: "Sem permissão para renomear esta rede." };
  }
  await logAction("renomear_rede", "chain", id, { nome: limpo });
  revalidatePath("/redes");
  revalidatePath("/lojas");
  return { ok: true as const };
}

/**
 * Apaga a rede, e só se ela estiver vazia.
 *
 * Sem essa checagem o banco faz o estrago em silêncio: as lojas continuam
 * existindo com a rede zerada, e as views do relatório derivam a rede do vínculo
 * ATUAL, então o histórico inteiro daquelas lojas passaria a aparecer sem rede.
 * Um relatório emitido em março deixaria de bater com o mesmo relatório de abril.
 */
export async function deleteChain(id: string) {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("stores")
    .select("id", { count: "exact", head: true })
    .eq("chain_id", id);
  if ((count ?? 0) > 0) {
    return { ok: false as const, error: `Esta rede tem ${count} loja(s). Mova ou apague as lojas antes.` };
  }
  const { error } = await supabase.from("retail_chains").delete().eq("id", id);
  if (error) return { ok: false as const, error: "Não foi possível excluir." };
  await logAction("excluir_rede", "chain", id);
  revalidatePath("/redes");
  return { ok: true as const };
}
