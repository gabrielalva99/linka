import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { ehOperadorDaPlataforma } from "@/lib/perms";
import { getActiveTenant } from "@/lib/tenant";
import { aparelhosPorCliente, lojasPorCliente } from "@/lib/contagens";
import { CreateTenantForm } from "./create-form";
import { TenantRow } from "./tenant-row";

type Contagem = { count: number }[] | { count: number } | null;
const conta = (c: Contagem) =>
  (Array.isArray(c) ? c[0]?.count : c?.count) ?? 0;

type Row = {
  id: string;
  name: string;
  slug: string;
  enrollment_code: string;
  is_active: boolean;
  created_at: string;
  maintenance_pin: string | null;
  memberships: Contagem;
};

/**
 * A lista de clientes da plataforma.
 *
 * Cada linha é um contrato: a marca, o tamanho da operação dela e o código que
 * o técnico usa para o aparelho entrar NESSA conta. Entrar no cliente troca o
 * painel inteiro — frota, lojas, campanhas e relatório passam a ser dele.
 *
 * Só quem opera a plataforma chega aqui. Para quem é de uma marca, esta tela não
 * deveria nem existir como ideia: ele tem um cliente e é o dele.
 */
export default async function ClientesPage() {
  if (!ehOperadorDaPlataforma(await getSessionContext())) redirect("/");

  const supabase = await createSupabaseServerClient();
  // Aparelhos e lojas vêm de views agrupadas, não da contagem embutida: a
  // embutida não aceita filtro e somava aparelho arquivado e loja desativada, ou
  // seja, mostrava um contrato maior do que o que está de pé.
  const [{ data }, ativo, aparelhos, lojas] = await Promise.all([
    supabase
      .from("tenants")
      .select(
        "id, name, slug, enrollment_code, is_active, created_at, maintenance_pin, memberships(count)",
      )
      .order("name"),
    getActiveTenant(),
    aparelhosPorCliente(supabase),
    lojasPorCliente(supabase),
  ]);

  const clientes = (data ?? []) as Row[];

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold">Clientes</h1>
      <p className="mt-1 text-sm text-muted">
        Cada cliente é uma operação separada: frota, lojas, campanhas e
        relatórios dele, que nenhum outro cliente enxerga.
      </p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-surface-2 text-left text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Cliente</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">Aparelhos</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">Lojas</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">Pessoas</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">
                Código de inscrição
              </th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">
                PIN de manutenção
              </th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {clientes.map((c) => (
              <TenantRow
                key={c.id}
                id={c.id}
                nome={c.name}
                slug={c.slug}
                codigo={c.enrollment_code}
                pin={c.maintenance_pin}
                aparelhos={aparelhos.get(c.id) ?? 0}
                lojas={lojas.get(c.id) ?? 0}
                pessoas={conta(c.memberships)}
                ativo={c.id === ativo?.id}
              />
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-sm font-medium text-muted">Novo cliente</h2>
      <CreateTenantForm />
      <p className="mt-2 text-xs text-muted">
        O código de inscrição é gerado junto e é o que decide em qual cliente o
        aparelho entra no provisionamento. Numa loja com aparelhos de duas
        marcas, cada um usa o código da sua.
      </p>
    </div>
  );
}
