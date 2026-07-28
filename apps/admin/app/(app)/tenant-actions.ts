"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { listTenants, TENANT_COOKIE } from "@/lib/tenant";

/**
 * Troca o cliente em que quem opera a plataforma está trabalhando.
 *
 * Só aceita id que esteja na lista que a própria pessoa enxerga. Sem essa
 * conferência, a escolha viraria um jeito de operar em cliente alheio digitando
 * um id — e como quem opera a plataforma tem acesso a todos por definição, o
 * RLS não recusaria.
 */
export async function selecionarCliente(id: string) {
  const disponiveis = await listTenants();
  if (!disponiveis.some((t) => t.id === id)) return;

  (await cookies()).set(TENANT_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  // O layout inteiro recarrega: a escolha muda TODA tela, não só a atual.
  revalidatePath("/", "layout");
}
