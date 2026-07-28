import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActiveTenant = { id: string; name: string; slug: string };

/** Cookie que guarda o cliente escolhido por quem opera a plataforma. */
export const TENANT_COOKIE = "linka_tenant";

/**
 * Clientes que a pessoa logada enxerga. O RLS já faz o recorte: quem é da
 * Motorola vê a Motorola; quem opera a plataforma vê todos.
 */
export async function listTenants(): Promise<ActiveTenant[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("tenants")
    .select("id, name, slug")
    .order("name");
  return (data ?? []) as ActiveTenant[];
}

/**
 * Cliente sobre o qual as telas operam.
 *
 * Antes isto devolvia "o primeiro cliente cadastrado". Funcionava porque só
 * existe um — e no dia em que entrasse o segundo, toda loja, todo aparelho e
 * todo convite criados iriam parar na Motorola, sem erro e sem aviso. Registro
 * gravado no cliente errado não dá tela vermelha: dá relatório errado meses
 * depois, quando já não dá para saber o que era de quem.
 *
 * Agora sai de quem está logado:
 *  - um cliente só à vista (qualquer usuário de marca): é ele, sem escolha;
 *  - vários (quem opera a plataforma): vale o escolhido no seletor.
 *
 * Sem escolha feita, cai no primeiro da lista — mas com o seletor no topo
 * dizendo qual é. A diferença para o defeito antigo não é o critério de
 * desempate, é a escolha estar VISÍVEL e ser trocável: antes o painel decidia
 * sozinho e ninguém tinha como saber nem mudar.
 */
export async function getActiveTenant(): Promise<ActiveTenant | null> {
  const disponiveis = await listTenants();
  if (disponiveis.length === 0) return null;
  if (disponiveis.length === 1) return disponiveis[0];

  const escolhido = (await cookies()).get(TENANT_COOKIE)?.value;
  // Confere contra a lista em vez de confiar no cookie: cookie é entrada do
  // usuário. Sem isso bastaria editar o valor para operar no cliente de outra
  // marca — e o RLS não recusaria, porque quem opera a plataforma tem acesso a
  // todos por definição.
  return disponiveis.find((t) => t.id === escolhido) ?? disponiveis[0];
}

/**
 * Id para filtrar as LISTAS por cliente, ou null quando não há o que filtrar.
 *
 * Devolve null com um cliente só porque aí o RLS já fez o recorte e o filtro
 * seria peso morto em toda consulta. Com mais de um, filtrar é obrigatório: para
 * quem opera a plataforma o RLS deixa passar TODOS os clientes, e sem o filtro a
 * lista de lojas da Motorola viria misturada com a da marca seguinte.
 */
export async function tenantFilter(): Promise<string | null> {
  const disponiveis = await listTenants();
  if (disponiveis.length <= 1) return null;
  return (await getActiveTenant())?.id ?? null;
}

/**
 * Aplica o recorte de cliente a uma consulta, quando há recorte a aplicar.
 *
 * Existe para a chamada ficar de uma linha só em toda tela. Espalhar
 * `if (filtro) q = q.eq(...)` por vinte arquivos é como um deles fica de fora —
 * e o que fica de fora não dá erro, dá lista de duas marcas juntas.
 */
export function porCliente<Q>(consulta: Q, tenantId: string | null): Q {
  if (!tenantId) return consulta;
  // A conversão é de propósito. Exigir a forma do construtor de consulta no
  // próprio tipo faz o TypeScript desistir ("type instantiation is excessively
  // deep") nas telas que montam quatro consultas de uma vez.
  return (consulta as { eq(coluna: string, valor: string): Q }).eq(
    "tenant_id",
    tenantId,
  );
}
