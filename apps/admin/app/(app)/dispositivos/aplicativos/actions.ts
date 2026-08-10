"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ehOperadorDaPlataformaAgora } from "@/lib/perms";
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

  // O CATÁLOGO É DA PLATAFORMA, não do cliente.
  //
  // `app_catalog` não tem dono: `com.android.chrome` é o navegador em qualquer
  // marca, e quem classifica uma vez classifica para todo mundo. Por isso a
  // política do banco só aceita superadmin — e a tela precisa concordar com ela.
  //
  // Na primeira versão desta tela eu liberei por `podeOperarAgora()` (agência),
  // e a varredura de 09/08 mostrou o resultado: os botões apareciam para o
  // operador, cada clique voltava recusado pelo banco, e a pendência nunca
  // fechava. Tela que oferece o que o banco recusa é pior que tela sem o botão.
  if (!(await ehOperadorDaPlataformaAgora())) {
    return {
      ok: false as const,
      error: "Só o operador da plataforma classifica aplicativos.",
    };
  }

  const supabase = await createSupabaseServerClient();
  // Conta as linhas ALÉM do gate acima, e não em vez dele. `upsert` tem dois
  // caminhos: inserindo, o RLS estoura e o erro pega; atualizando uma linha que
  // já existe, ele afeta zero linhas em silêncio. Se um dia o gate mudar de
  // lugar ou a política do banco for ajustada, esta contagem continua de pé.
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

  // INSERT barrado por RLS ESTOURA (ao contrário de UPDATE e DELETE, que só
  // afetam zero linhas em silêncio). Então aqui a checagem é o erro — e o texto
  // do Postgres nunca chega à tela: "new row violates row-level security policy
  // for table app_catalog" não é frase que se mostre a quem usa o painel.
  if (error) {
    if (error.code === "42501") {
      return { ok: false as const, error: "Sem permissão para classificar." };
    }
    return { ok: false as const, error: "Não foi possível classificar." };
  }
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
