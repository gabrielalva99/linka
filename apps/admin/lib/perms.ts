import { getSessionContext, type SessionContext } from "@/lib/auth";

/**
 * Quem pode MEXER, e não só olhar.
 *
 * O isolamento de verdade é do banco: o RLS já recusa a escrita de quem não
 * pode. Isto aqui é sobre honestidade da tela. Mostrar "Excluir" para quem vai
 * receber uma recusa é pior do que esconder: a pessoa clica, o painel recarrega
 * igual, e ela conclui que o sistema não funciona. Pior ainda quando o clique
 * era "Desprovisionar" e ela passa a semana achando que desprovisionou.
 *
 * Decisão do Gabriel em 28/07: quem é da marca entra para OLHAR. Vê a frota,
 * os problemas e os relatórios da rede dela; quem opera é a ProSolution.
 */
export function podeOperar(ctx: SessionContext | null): boolean {
  if (!ctx) return false;
  return ctx.isSuperadmin || ctx.memberships.some((m) => m.role === "agency");
}

/** Ações de plataforma (publicar versão do app) são só do operador LINKA. */
export function ehOperadorDaPlataforma(ctx: SessionContext | null): boolean {
  return ctx?.isSuperadmin ?? false;
}

/** Atalho para telas de servidor que só precisam da resposta. */
export async function podeOperarAgora(): Promise<boolean> {
  return podeOperar(await getSessionContext());
}
