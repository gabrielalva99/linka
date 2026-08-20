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
 * Tira de cena a versão vigente DO MESMO ALVO — e só dele.
 *
 * É a linha mais perigosa desta tela. Sem o recorte por alvo, publicar uma
 * versão de TV desligaria a versão que os 250 aparelhos de loja obedecem, e a
 * frota inteira ficaria sem versão publicada sem ninguém pedir isso. O índice
 * único do banco garante que só exista uma por alvo; este recorte garante que a
 * que sai é a certa.
 *
 * `.is(null)` e `.eq(valor)` são caminhos diferentes de propósito: no Postgres,
 * `= null` não casa com nada, então usar `.eq` para o alvo geral afetaria ZERO
 * linhas em silêncio e deixaria duas versões vigentes brigando.
 */
async function tirarDoAr(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  alvo: string | null,
) {
  const q = supabase.from("agent_releases").update({ is_current: false }).eq("is_current", true);
  return alvo === null
    ? await q.is("target_device_type", null)
    : await q.eq("target_device_type", alvo);
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

  // Uma versão vale por vez POR ALVO: a anterior do mesmo alvo sai de cena antes
  // de a nova entrar. Ordem importa — o banco tem índice único garantindo que só
  // exista uma vigente por alvo.
  const { error: offErr } = await tirarDoAr(supabase, alvo);
  if (offErr) return { ok: false, error: "Não foi possível publicar." };

  // NÃO conta linhas de propósito, e aqui é seguro: INSERT barrado por RLS
  // ESTOURA (ao contrário de UPDATE e DELETE, que afetam zero linhas em
  // silêncio). Quem não pode publicar não passa daqui, então o UPDATE de
  // is_current logo acima — que seria silencioso — nunca fica órfão: ou os dois
  // acontecem, ou a função sai pelo erro antes de gravar a trilha.
  const { error } = await supabase.from("agent_releases").insert({
    version,
    url,
    notes: notes || null,
    is_current: true,
    target_device_type: alvo,
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

  // O alvo vem da versão escolhida, e não de quem clicou: voltar a frota de TV
  // para uma versão anterior não pode mexer na versão que os celulares obedecem.
  const { data: alvoDela } = await supabase
    .from("agent_releases")
    .select("target_device_type")
    .eq("id", id)
    .maybeSingle();
  if (!alvoDela) return;

  await tirarDoAr(supabase, alvoDela.target_device_type ?? null);
  await supabase.from("agent_releases").update({ is_current: true }).eq("id", id);
  revalidatePath("/dispositivos/versoes");
}
