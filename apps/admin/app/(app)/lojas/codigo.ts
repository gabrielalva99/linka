"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { podeOperarAgora } from "@/lib/perms";
import { getActiveTenant } from "@/lib/tenant";

/**
 * Gera um código de loja livre para o cliente ativo.
 *
 * Existe para o caso em que a rede não tem código de PDV para dar, ou não tem a
 * tempo da visita. Quando ela TEM, use o dela: é o código que o BI da marca já
 * fala, e inventar um paralelo cria uma tabela de tradução que alguém mantém
 * para sempre.
 *
 * O alfabeto não tem O, I, 0 nem 1. Alguém vai ditar isso por telefone de dentro
 * de uma loja, e é aí que "0" vira "O" e quinze aparelhos entram no lugar
 * errado.
 */
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function sorteia(tamanho: number): string {
  let saida = "";
  for (let i = 0; i < tamanho; i++) {
    saida += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  }
  return saida;
}

export async function gerarCodigoDeLoja(): Promise<{ codigo: string } | { erro: string }> {
  if (!(await podeOperarAgora())) return { erro: "Sem permissão." };
  const tenant = await getActiveTenant();
  if (!tenant) return { erro: "Nenhum cliente ativo." };

  const supabase = await createSupabaseServerClient();
  // Confere contra os códigos que já existem NESTE cliente. O banco também
  // recusa repetido, mas descobrir isso só na hora de salvar faz a pessoa perder
  // o formulário inteiro preenchido.
  const { data } = await supabase
    .from("stores")
    .select("code")
    .eq("tenant_id", tenant.id)
    .not("code", "is", null);
  const usados = new Set((data ?? []).map((s) => String(s.code).toUpperCase()));

  for (let tentativa = 0; tentativa < 20; tentativa++) {
    const codigo = `LJ${sorteia(4)}`;
    if (!usados.has(codigo)) return { codigo };
  }
  return { erro: "Não consegui gerar um código livre." };
}
