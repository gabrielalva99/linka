"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTenant } from "@/lib/tenant";
import { logAction } from "@/lib/audit";
import type { ContentFit } from "@linka/shared";

/**
 * Define como o vídeo é enquadrado na tela (vale para todo aparelho que o exibir).
 *
 * Conta as linhas porque UPDATE barrado por RLS não estoura — afeta zero linhas
 * e volta sem erro. Antes desta contagem, um papel de leitura clicava no botão,
 * a tela recarregava igual, e ele concluía que o painel estava quebrado.
 */
export async function setMediaFit(id: string, fit: ContentFit, deviceId?: string) {
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from("media_assets")
    .update({ fit_mode: fit }, { count: "exact" })
    .eq("id", id);
  if (error) return { ok: false as const, error: "Não foi possível salvar." };
  if ((count ?? 0) === 0) {
    return { ok: false as const, error: "Sem permissão para alterar este arquivo." };
  }
  revalidatePath("/biblioteca");
  if (deviceId) revalidatePath(`/dispositivos/${deviceId}`);
  return { ok: true as const };
}

/**
 * Registra na biblioteca um arquivo recém-enviado ao armazenamento.
 *
 * Existe separado do envio pela tela do aparelho porque aquele caminho APLICA o
 * vídeo no aparelho junto — efeito colateral que não se quer ao abastecer a
 * biblioteca. Enquanto ele era o único caminho, subir catorze arquivos de uma
 * campanha significava aplicar catorze vídeos num aparelho ao acaso.
 */
export async function addToLibrary(input: {
  name: string;
  path: string;
  contentType: string;
  size: number;
  width?: number;
  height?: number;
}) {
  const tenant = await getActiveTenant();
  if (!tenant) return { ok: false as const, error: "Sem cliente ativo." };

  // O CAMINHO TEM QUE SER DA PASTA DESTE CLIENTE.
  //
  // A varredura de 09/08 provou o furo: `url` e `path` vinham do navegador sem
  // nenhuma checagem, e dava para registrar na própria biblioteca um arquivo da
  // pasta de outro cliente. O RLS não pega isso — o `tenant_id` da linha está
  // certo; o que está errado é para onde ela aponta.
  //
  // A `url` sumiu do contrato: ela agora é DERIVADA do caminho, aqui no
  // servidor. Aceitar a URL que o navegador manda era confiar em quem chama para
  // dizer onde o arquivo mora — e o índice único de URL, que protege contra
  // sequestro de peça, virava algo que qualquer um podia ocupar de fora.
  if (!input.path.startsWith(`${tenant.id}/`)) {
    return { ok: false as const, error: "Caminho de arquivo inválido." };
  }

  // A resolução vem do navegador: entrada de fora, mesma régua de sempre.
  const dim = (v: number | undefined) =>
    typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 20000 ? v : null;
  const w = dim(input.width);
  const h = dim(input.height);

  const supabase = await createSupabaseServerClient();
  // A URL sai do caminho, no servidor — nunca do que o navegador mandou.
  const { data: publica } = supabase.storage.from("content").getPublicUrl(input.path);

  const { data, error } = await supabase
    .from("media_assets")
    .insert({
      tenant_id: tenant.id,
      name: input.name,
      storage_path: input.path,
      url: publica.publicUrl,
      content_type: input.contentType,
      size_bytes: input.size,
      // As duas juntas ou nenhuma: só a largura não decide formato nenhum.
      width: w && h ? w : null,
      height: w && h ? h : null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // URL única é proteção de isolamento entre clientes (ver a migration de
    // 08/08). Aqui ela aparece como "este arquivo já está na biblioteca", que é
    // o que de fato aconteceu quando alguém reenvia o mesmo lote.
    if (error.code === "23505") {
      return { ok: false as const, error: "Este arquivo já está na biblioteca." };
    }
    return { ok: false as const, error: error.message };
  }
  if (!data) return { ok: false as const, error: "Sem permissão para enviar." };

  await logAction("enviar_video", "media_asset", data.id, { nome: input.name });
  revalidatePath("/biblioteca");
  return { ok: true as const, id: data.id as string };
}

/**
 * Liga este arquivo a uma peça, como a versão dela para outro formato de tela.
 *
 * O QUE ISSO MUDA NA VITRINE. A campanha continua apontando para a peça
 * principal; na hora de entregar, o servidor troca pelo arquivo cujo formato
 * combina com a tela daquele aparelho. É assim que a mesma campanha do Dia dos
 * Pais toca inteira no Razr fechado, no Razr aberto e no G06 sem ninguém montar
 * três campanhas.
 *
 * `null` desfaz o vínculo e devolve o arquivo à condição de peça independente.
 *
 * As regras duras (mesmo cliente, um nível só, sem laço) vivem em gatilho no
 * banco, e não aqui. Esta função é uma das portas; o gatilho vale para todas —
 * inclusive para quem chamar a API por fora do painel.
 */
export async function setVariantOf(id: string, parentId: string | null) {
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from("media_assets")
    .update({ variant_of: parentId }, { count: "exact" })
    .eq("id", id);

  // Conta as linhas em vez de confiar na ausência de erro: UPDATE barrado por RLS
  // afeta ZERO linhas e volta sem erro nenhum. Sem esta checagem, quem não tem
  // permissão veria "salvo" numa tela que não salvou nada — o mesmo defeito que
  // já apareceu na exclusão de vídeo e na auditoria.
  if (error) {
    return { ok: false as const, error: error.message };
  }
  if ((count ?? 0) === 0) {
    return { ok: false as const, error: "Sem permissão para alterar este arquivo." };
  }

  await logAction("vincular_variante", "media_asset", id, { variante_de: parentId });
  revalidatePath("/biblioteca");
  return { ok: true as const };
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
