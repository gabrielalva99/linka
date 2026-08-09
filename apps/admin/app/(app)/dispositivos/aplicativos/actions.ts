"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAction } from "@/lib/audit";

/**
 * Decide se um pacote medido é recurso do cliente ou ruído do sistema.
 *
 * POR QUE ISTO PRECISA DE UMA PESSOA. O aparelho mede tudo que aparece na tela,
 * e não tem como saber a diferença entre "o cliente abriu a câmera para testar"
 * e "o app de bateria abriu sozinho por uma notificação". Os dois chegam como
 * pacote e duração.
 *
 * O DEFAULT É PERIGOSO, e é por isso que esta tela existe: sem registro no
 * catálogo, um pacote novo é contado como recurso testado e aparece no relatório
 * com nome de programador. O número que sustenta a promessa de venda do produto
 * — "qual recurso o cliente procura" — fica errado sem ninguém perceber, porque
 * parece um dado.
 *
 * Tratar desconhecido como ruído por padrão seria pior: esconderia recurso de
 * verdade em silêncio, e aí o erro nunca aparece.
 *
 * A classificação é GLOBAL, sem cliente: `com.android.chrome` é o navegador em
 * qualquer marca. Quem classifica uma vez classifica para todo mundo.
 */
export async function classificarPacote(
  pacote: string,
  rotulo: string,
  ehRuido: boolean,
) {
  const pkg = pacote.trim();
  const label = rotulo.trim();
  if (!pkg) return { ok: false as const, error: "Pacote vazio." };
  if (!label) return { ok: false as const, error: "Dê um nome que a operação reconheça." };

  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from("app_catalog")
    .upsert(
      {
        package: pkg,
        label,
        category: ehRuido ? "sistema" : "recurso",
        is_noise: ehRuido,
      },
      { onConflict: "package", count: "exact" },
    );

  // Conta as linhas: escrita barrada por RLS não estoura, afeta zero linhas e
  // volta sem erro. Sem isto, quem não tem permissão via "classificado" numa
  // tela que não classificou nada.
  if (error) return { ok: false as const, error: error.message };
  if ((count ?? 0) === 0) {
    return { ok: false as const, error: "Sem permissão para classificar." };
  }

  // Sem id de entidade: a chave do catálogo é o próprio pacote, e ele vai nos
  // detalhes. `undefined` e não `null` porque é o que a trilha aceita.
  await logAction("classificar_pacote", "app_catalog", undefined, {
    pacote: pkg,
    rotulo: label,
    ruido: ehRuido,
  });
  revalidatePath("/dispositivos/aplicativos");
  revalidatePath("/");
  revalidatePath("/relatorios");
  return { ok: true as const };
}
