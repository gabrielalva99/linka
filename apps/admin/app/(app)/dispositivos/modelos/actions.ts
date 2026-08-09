"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTenant } from "@/lib/tenant";
import { logAction } from "@/lib/audit";

export type CreateModelState = { status: "idle" | "ok" | "dup" | "error" };

export async function createModel(
  _prev: CreateModelState,
  formData: FormData,
): Promise<CreateModelState> {
  const name = String(formData.get("name") ?? "").trim();
  const line = String(formData.get("line") ?? "").trim() || null;
  if (!name) return { status: "error" };

  const tenant = await getActiveTenant();
  if (!tenant) return { status: "error" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("device_models")
    .insert({ tenant_id: tenant.id, name, line });

  if (error) return { status: error.code === "23505" ? "dup" : "error" };

  revalidatePath("/dispositivos/modelos");
  return { status: "ok" };
}

/**
 * Corrige o nome do modelo e o tamanho da tela.
 *
 * A TELA É O QUE ESCOLHE O CRIATIVO. Com ela preenchida, o servidor entrega a
 * cada aparelho a versão do vídeo feita para o formato dele; sem ela, todos
 * recebem a peça principal — que é o comportamento de sempre, e não uma falha.
 *
 * As duas juntas ou nenhuma: meia medida (só a largura) não decide nada e
 * ficaria guardada parecendo configuração feita.
 */
export async function renameModel(
  id: string,
  name: string,
  line: string,
  screenWidth?: string,
  screenHeight?: string,
) {
  const nome = name.trim();
  if (!nome) return { ok: false as const, error: "Digite um nome." };

  const w = String(screenWidth ?? "").trim();
  const h = String(screenHeight ?? "").trim();
  if ((w === "") !== (h === "")) {
    return {
      ok: false as const,
      error: "Preencha largura e altura da tela, ou deixe as duas em branco.",
    };
  }
  let largura: number | null = null;
  let altura: number | null = null;
  if (w !== "") {
    largura = Number(w);
    altura = Number(h);
    if (
      !Number.isInteger(largura) || !Number.isInteger(altura) ||
      largura <= 0 || altura <= 0 || largura > 20000 || altura > 20000
    ) {
      return { ok: false as const, error: "Tela inválida. Use números em pixels, como 1080 e 2400." };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("device_models")
    .update({
      name: nome,
      line: line.trim() || null,
      screen_width: largura,
      screen_height: altura,
    })
    .eq("id", id);
  if (error) {
    return {
      ok: false as const,
      error: error.code === "23505" ? "Já existe um modelo com esse nome." : "Não foi possível salvar.",
    };
  }
  await logAction("renomear_modelo", "device_model", id, {
    nome,
    tela: largura ? `${largura}x${altura}` : null,
  });
  revalidatePath("/dispositivos/modelos");
  revalidatePath("/dispositivos");
  return { ok: true as const };
}

/**
 * Apaga o modelo, e só se nenhum aparelho estiver usando.
 *
 * Sem a trava, o banco zera o vínculo dos aparelhos em silêncio e a coluna
 * Modelo da frota passa a mostrar só o que o próprio aparelho reporta, sem
 * ninguém entender por que o catálogo sumiu.
 */
export async function deleteModel(id: string) {
  const supabase = await createSupabaseServerClient();
  // Conta ARQUIVADO também, de propósito: o banco recusa por chave estrangeira
  // de qualquer forma, e o histórico por modelo é o que sustenta o relatório de
  // linha. Mas a mensagem tem que dizer que existe arquivado no meio — senão
  // manda "troque o modelo deles" apontando para aparelhos que a pessoa não
  // encontra em lista nenhuma, e ela fica travada sem entender o motivo.
  const [{ count }, { count: ativos }] = await Promise.all([
    supabase
      .from("devices")
      .select("id", { count: "exact", head: true })
      .eq("model_id", id),
    supabase
      .from("devices")
      .select("id", { count: "exact", head: true })
      .eq("model_id", id)
      .eq("is_active", true),
  ]);
  if ((count ?? 0) > 0) {
    const arquivados = (count ?? 0) - (ativos ?? 0);
    const onde =
      arquivados > 0
        ? ativos
          ? ` (${ativos} em operação e ${arquivados} arquivado(s))`
          : ` — todos arquivados, veja em Frota › arquivados`
        : "";
    return {
      ok: false as const,
      error: `${count} aparelho(s) usam este modelo${onde}. Troque o modelo deles antes.`,
    };
  }
  const { error } = await supabase.from("device_models").delete().eq("id", id);
  if (error) return { ok: false as const, error: "Não foi possível excluir." };
  await logAction("excluir_modelo", "device_model", id);
  revalidatePath("/dispositivos/modelos");
  return { ok: true as const };
}
