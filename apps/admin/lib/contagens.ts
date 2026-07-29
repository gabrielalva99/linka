import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { porCliente } from "@/lib/tenant";

/**
 * Contagens de "quantos existem agora", lidas de views agrupadas no banco.
 *
 * Existe porque a contagem embutida do PostgREST (`devices(count)`) não aceita
 * filtro: somava aparelho arquivado e loja desativada em três telas ao mesmo
 * tempo — clientes, modelos e redes. Cada uma mostrava um tamanho de operação
 * que não existia.
 *
 * E não é contado aqui em JavaScript de propósito. Trazer as linhas para contar
 * no painel funcionaria com a frota de hoje e passaria a errar em silêncio na
 * frota alvo: o PostgREST corta a resposta em 1000 linhas, então a partir do
 * milésimo aparelho o número simplesmente pararia de crescer, sem erro nenhum.
 * As views devolvem uma linha por cliente/loja/modelo.
 */
/**
 * Amarrado ao cliente que as telas realmente criam, em vez de a um genérico
 * escrito à mão: escrever o genérico de novo aqui foi o que quebrou a compilação,
 * porque a versão real vem com cinco parâmetros de tipo e não com um.
 */
type Cliente = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type Linha = Record<string, unknown>;
type Resposta = PromiseLike<{ data: Linha[] | null }>;

/**
 * A forma da consulta é declarada à mão porque o `select` é montado em tempo de
 * execução (`"store_id, total"`), e o tipo do PostgREST só entende colunas
 * escritas literalmente — com string variável ele devolve um erro de tipo em vez
 * das linhas. Declarar a forma é o que permite as cinco contagens
 * compartilharem uma função em vez de repetir o mesmo bloco cinco vezes.
 */
async function mapear(
  supabase: Cliente,
  view: string,
  chave: string,
  tenantId: string | null,
): Promise<Map<string, number>> {
  const consulta = (
    supabase as unknown as {
      from(v: string): {
        select(c: string): Resposta & {
          eq(coluna: string, valor: string): Resposta;
        };
      };
    }
  )
    .from(view)
    .select(`${chave}, total`);

  const { data } = await porCliente(consulta, tenantId);
  const mapa = new Map<string, number>();
  for (const linha of data ?? []) {
    const id = linha[chave];
    if (typeof id !== "string") continue;
    mapa.set(id, Number(linha.total ?? 0));
  }
  return mapa;
}

/** Aparelhos em operação por cliente. Chave: tenant_id. */
export const aparelhosPorCliente = (supabase: Cliente) =>
  mapear(supabase, "v_aparelhos_por_cliente", "tenant_id", null);

/** Aparelhos em operação por loja. Chave: store_id. */
export const aparelhosPorLoja = (supabase: Cliente, tenantId: string | null) =>
  mapear(supabase, "v_aparelhos_por_loja", "store_id", tenantId);

/** Aparelhos em operação por modelo. Chave: model_id. */
export const aparelhosPorModelo = (supabase: Cliente, tenantId: string | null) =>
  mapear(supabase, "v_aparelhos_por_modelo", "model_id", tenantId);

/** Lojas ativas por cliente. Chave: tenant_id. */
export const lojasPorCliente = (supabase: Cliente) =>
  mapear(supabase, "v_lojas_por_cliente", "tenant_id", null);

/** Lojas ativas por rede. Chave: chain_id. */
export const lojasPorRede = (supabase: Cliente, tenantId: string | null) =>
  mapear(supabase, "v_lojas_por_rede", "chain_id", tenantId);
