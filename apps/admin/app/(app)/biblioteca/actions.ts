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
  // "denied" existe separado de "failed" porque as duas exigem coisas
  // diferentes de quem está na tela: uma é trocar de conta, a outra é tentar de
  // novo. Juntar as duas num "não deu" manda a pessoa insistir num caminho que
  // nunca vai abrir.
  | { ok: false; reason: "denied" }
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

  // CONTA AS LINHAS, não confia na ausência de erro.
  //
  // DELETE barrado por RLS não estoura: apaga zero linhas e volta sem erro
  // nenhum. Só o INSERT reclama. Com `if (error)` sozinho, quem não é agência via
  // "vídeo excluído" na tela, o vídeo continuava lá, e a auditoria registrava uma
  // exclusão que nunca aconteceu — logo depois de eu ter posto uma lista de ações
  // conhecidas justamente para a trilha não aceitar fato inventado.
  const { error, count: apagadas } = await supabase
    .from("media_assets")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) return { ok: false, reason: "failed" };
  if ((apagadas ?? 0) === 0) return { ok: false, reason: "denied" };

  // O ARQUIVO: se a remoção falhar, isso precisa aparecer em algum lugar.
  //
  // Estava sem conferência nenhuma. O caso ruim é silencioso: banco apagou,
  // Storage não, e sobra um arquivo que ninguém mais alcança — sem linha
  // apontando para ele, não há como listar nem cobrar de volta. Vira conta de
  // armazenamento subindo sem explicação.
  const { error: errArquivo } = await supabase
    .storage.from("content").remove([asset.storage_path]);
  await logAction("excluir_video", "media_asset", id, {
    storage_path: asset.storage_path,
    // Com isto, o órfão fica localizável pela própria trilha.
    arquivo_removido: !errArquivo,
    ...(errArquivo ? { arquivo_erro: errArquivo.message } : {}),
  });

  revalidatePath("/biblioteca");
  return { ok: true };
}
