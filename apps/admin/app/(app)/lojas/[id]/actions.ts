"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTenant } from "@/lib/tenant";
import { logAction } from "@/lib/audit";
import { podeOperarAgora } from "@/lib/perms";

export type CreatePositionState = { status: "idle" | "ok" | "error" };

export async function createPosition(
  _prev: CreatePositionState,
  formData: FormData,
): Promise<CreatePositionState> {
  const storeId = String(formData.get("store_id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!storeId || !label) return { status: "error" };

  const tenant = await getActiveTenant();
  if (!tenant) return { status: "error" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("positions")
    .insert({ tenant_id: tenant.id, store_id: storeId, label });

  if (error) return { status: "error" };

  revalidatePath(`/lojas/${storeId}`);
  return { status: "ok" };
}

/** Corrige o rótulo da posição. Antes, renomear "Mesa 3" exigia apagar e
 *  recriar, o que soltava todos os aparelhos que estavam ali. */
export async function renamePosition(id: string, label: string, storeId: string) {
  const limpo = label.trim();
  if (!limpo) return { ok: false as const, error: "Digite um nome." };
  const supabase = await createSupabaseServerClient();
  // Conta as linhas: UPDATE barrado por RLS afeta zero linhas e volta sem erro.
  const { error, count } = await supabase
    .from("positions")
    .update({ label: limpo }, { count: "exact" })
    .eq("id", id);
  if (error) return { ok: false as const, error: "Não foi possível salvar." };
  if ((count ?? 0) === 0) {
    return { ok: false as const, error: "Sem permissão para renomear esta posição." };
  }
  await logAction("renomear_posicao", "store", storeId, { posicao: limpo });
  revalidatePath(`/lojas/${storeId}`);
  return { ok: true as const };
}

/**
 * Apaga a posição, e só se não houver aparelho nela.
 *
 * Antes apagava calado. A chave estrangeira solta o vínculo dos aparelhos, e a
 * ficha deles passava a mostrar um traço no lugar da posição, sem ninguém
 * entender por quê. Quem está na loja procurando o aparelho "da mesa 3" fica
 * sem a informação que foi buscar.
 */
export async function deletePosition(id: string, storeId: string) {
  const supabase = await createSupabaseServerClient();
  // Posição de aparelho arquivado ainda segura a exclusão (chave estrangeira),
  // mas "mova antes de apagar" só faz sentido para quem está em operação. Sem
  // separar os dois, a pessoa procura na loja um aparelho que já foi recolhido.
  const [{ count }, { count: ativos }] = await Promise.all([
    supabase
      .from("devices")
      .select("id", { count: "exact", head: true })
      .eq("position_id", id),
    supabase
      .from("devices")
      .select("id", { count: "exact", head: true })
      .eq("position_id", id)
      .eq("is_active", true),
  ]);
  if ((count ?? 0) > 0) {
    const arquivados = (count ?? 0) - (ativos ?? 0);
    return {
      ok: false as const,
      error: ativos
        ? `${ativos} aparelho(s) estão nesta posição. Mova antes de apagar.`
        : `${arquivados} aparelho(s) arquivado(s) ainda apontam para esta posição. ` +
          `Ela não pode ser apagada sem perder de onde eles vinham no histórico.`,
    };
  }
  const { error } = await supabase.from("positions").delete().eq("id", id);
  if (error) return { ok: false as const, error: "Não foi possível excluir." };
  await logAction("excluir_posicao", "store", storeId);
  revalidatePath(`/lojas/${storeId}`);
  return { ok: true as const };
}

/**
 * Gera o link de auto-cadastro de quem recebe aviso desta loja.
 *
 * O TOKEN NASCE NO SERVIDOR, e é longo de propósito: ele é a única coisa que
 * autoriza um estranho a se cadastrar, então precisa ser impossível de adivinhar
 * e chato de digitar errado.
 *
 * Um convite por vez, reaproveitado enquanto valer. Gerar um novo a cada clique
 * encheria a loja de links vivos, e link vivo esquecido é porta aberta.
 */
export async function linkDeCadastro(storeId: string) {
  if (!(await podeOperarAgora())) {
    return { ok: false as const, error: "Sem permissão." };
  }
  const tenant = await getActiveTenant();
  if (!tenant) return { ok: false as const, error: "Sem cliente ativo." };

  const supabase = await createSupabaseServerClient();
  const { data: loja } = await supabase
    .from("stores")
    .select("id, name")
    .eq("id", storeId)
    .maybeSingle();
  if (!loja) return { ok: false as const, error: "Loja não encontrada." };

  // Reaproveita o convite vivo. Vencido ou esgotado nao serve, e gerar outro
  // por cima deixaria dois links validos para a mesma loja circulando.
  const { data: existente } = await supabase
    .from("convites_de_contato")
    .select("token, usos, max_usos, expira_em")
    .eq("tenant_id", tenant.id)
    .contains("lojas", [storeId])
    .gt("expira_em", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  const vivo =
    existente && (existente.usos as number) < (existente.max_usos as number)
      ? existente
      : null;
  let token = vivo?.token as string | undefined;
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().slice(0, 8);
    const { error } = await supabase.from("convites_de_contato").insert({
      tenant_id: tenant.id,
      token,
      rotulo: `Avisos de ${loja.name}`,
      lojas: [storeId],
    });
    if (error) return { ok: false as const, error: "Não consegui gerar o link." };
    await logAction("convidar_contato", "store", storeId, { loja: loja.name });
  }

  revalidatePath(`/lojas/${storeId}`);
  return {
    ok: true as const,
    token,
    usos: (vivo?.usos as number | undefined) ?? 0,
    maxUsos: (vivo?.max_usos as number | undefined) ?? 20,
    expiraEm: (vivo?.expira_em as string | undefined) ?? null,
  };
}

/** Tira a pessoa da lista de avisos. Não apaga: histórico de quem respondeu fica. */
export async function desativarContato(contatoId: string, storeId: string) {
  if (!(await podeOperarAgora())) {
    return { ok: false as const, error: "Sem permissão." };
  }
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from("contatos_de_loja")
    .update({ ativo: false }, { count: "exact" })
    .eq("id", contatoId);
  if (error || (count ?? 0) === 0) {
    return { ok: false as const, error: "Não consegui remover." };
  }
  await logAction("remover_contato", "store", storeId, {});
  revalidatePath(`/lojas/${storeId}`);
  return { ok: true as const };
}
