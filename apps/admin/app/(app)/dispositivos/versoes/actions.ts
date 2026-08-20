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
 * Para quem esta versão vale.
 *
 * Vazio = toda a frota, que é como sempre funcionou. Preenchido = só aquele tipo
 * de aparelho, e vence da geral para ele. O vocabulário é o do banco
 * (public.device_type) de propósito: uma lista escrita à mão aqui seria uma
 * segunda verdade para o mesmo assunto.
 */
const ALVOS = ["smartphone", "tablet", "tv", "notebook", "other"] as const;

function alvoDoForm(form: FormData): string | null {
  const bruto = String(form.get("target_device_type") ?? "").trim();
  if (!bruto || bruto === "todos") return null;
  return (ALVOS as readonly string[]).includes(bruto) ? bruto : null;
}

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

  const alvo = alvoDoForm(form);
  const supabase = await createSupabaseServerClient();

  // TUDO OU NADA, e isto custou um susto para virar regra.
  //
  // Publicar são dois passos: tirar a vigente do ar e gravar a nova. Feitos
  // soltos daqui, o segundo pode falhar depois de o primeiro já ter acontecido —
  // e aí a frota fica SEM versão publicada sem ninguém ter pedido isso.
  //
  // Aconteceu em 20/08 às 17:23: a 0.104.0 foi publicada, o botão foi clicado de
  // novo, o primeiro passo tirou a 0.104.0 do ar, o segundo bateu em "essa versão
  // já existe", e a tela respondeu com uma mensagem que soa inofensiva para um
  // estado que já estava quebrado. Só não virou apagão porque o alvo era
  // "smartphone"; no alvo geral teria derrubado a versão dos 15 aparelhos.
  //
  // Agora os dois passos moram numa função do banco, que é atômica: se a gravação
  // estoura, a retirada volta atrás junto. Não existe mais estado no meio.
  const { error } = await supabase.rpc("publicar_release", {
    p_version: version,
    p_url: url,
    p_notes: notes || null,
    p_alvo: alvo,
  });
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "Essa versão já existe." : "Não foi possível publicar.",
    };
  }

  await logAction("publicar_versao", "agent_release", undefined, {
    versao: version,
    alvo: alvo ?? "todos",
  });
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
  // Mesma armadilha da publicação, mesmo remédio: quem tira uma do ar e põe a
  // outra no lugar é o banco, de uma vez. O alvo sai da versão escolhida, e não
  // de quem clicou — voltar a frota de TV não pode mexer na dos celulares.
  await supabase.rpc("tornar_release_vigente", { p_id: id });
  revalidatePath("/dispositivos/versoes");
}
