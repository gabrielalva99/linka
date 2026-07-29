import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { podeOperarAgora } from "@/lib/perms";
import { emOperacao, porCliente, tenantFilter } from "@/lib/tenant";

type StoreRow = {
  id: string;
  name: string;
  code: string | null;
  kind: string;
  city: string | null;
  state: string | null;
  country: string;
  opens_at: string | null;
  closes_at: string | null;
  retail_chains: { name: string | null } | { name: string | null }[] | null;
};

export default async function LojasPage() {
  const supabase = await createSupabaseServerClient();
  const filtro = await tenantFilter();

  // opens_at e closes_at estavam no tipo e na tela, mas NUNCA foram pedidos ao
  // banco. A coluna de horário caía no valor de reserva e mostrava "09:00 às
  // 22:00" para todas as lojas — inclusive para a que fecha às 20h. Erro que o
  // TypeScript não pega: o `select` devolve um tipo largo e a asserção logo
  // abaixo afirmava campos que não vinham.
  const [{ data }, { data: porLoja }] = await Promise.all([
    porCliente(
      supabase
        .from("stores")
        .select(
          "id, name, code, kind, city, state, country, opens_at, closes_at, retail_chains(name)",
        ),
      filtro,
    ).order("name", { ascending: true }),
    // A contagem de aparelhos tinha o mesmo problema, e pior: lia `s.devices`,
    // que não existia no resultado. Toda loja aparecia com 0 aparelhos, mesmo
    // cheia. Vem em consulta separada porque a contagem embutida do PostgREST
    // não aceita filtro — e sem filtrar voltaria a somar arquivado.
    emOperacao(supabase.from("devices").select("store_id"), filtro),
  ]);

  const t = getMessages();
  const podeEditar = await podeOperarAgora();
  const stores = (data ?? []) as StoreRow[];

  const aparelhosDaLoja = new Map<string, number>();
  for (const d of (porLoja ?? []) as { store_id: string | null }[]) {
    if (!d.store_id) continue;
    aparelhosDaLoja.set(d.store_id, (aparelhosDaLoja.get(d.store_id) ?? 0) + 1);
  }

  const kindLabel = (k: string) =>
    k === "shopping"
      ? t.stores.kindShopping
      : k === "street"
        ? t.stores.kindStreet
        : t.stores.kindOther;

  const chainName = (rel: StoreRow["retail_chains"]) =>
    (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "—";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t.stores.title}</h1>
        {podeEditar && (
        <Link
          href="/lojas/nova"
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          {t.stores.new}
        </Link>
        )}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-line">
        {stores.length > 0 ? (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{t.stores.name}</th>
                <th className="px-4 py-2 font-medium">{t.stores.code}</th>
                <th className="px-4 py-2 font-medium">{t.stores.chain}</th>
                <th className="px-4 py-2 font-medium">{t.stores.kind}</th>
                <th className="px-4 py-2 font-medium">{t.stores.city}</th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">
                  {t.stores.colHours}
                </th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">
                  {t.stores.colDevices}
                </th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {stores.map((s) => (
                <tr key={s.id} className="bg-surface">
                  <td className="px-4 py-3">
                    <Link
                      href={`/lojas/${s.id}`}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {s.name}
                    </Link>
                  </td>
                  {/* Loja sem código não recebe aparelho no campo: é o código
                      que o técnico digita para o aparelho entrar já nesta loja.
                      Sem aviso aqui, a equipe descobre isso dentro da loja, com
                      quinze aparelhos na mão e ninguém para resolver. */}
                  <td className="px-4 py-3">
                    {s.code ? (
                      <span className="font-mono text-xs">{s.code}</span>
                    ) : (
                      <span className="whitespace-nowrap rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">
                        {t.stores.noCode}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{chainName(s.retail_chains)}</td>
                  <td className="px-4 py-3 text-muted">{kindLabel(s.kind)}</td>
                  <td className="px-4 py-3 text-muted">
                    {s.city ? `${s.city}${s.state ? `/${s.state}` : ""}` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {`${String(s.opens_at ?? "09:00").slice(0, 5)} às ${String(
                      s.closes_at ?? "22:00",
                    ).slice(0, 5)}`}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {aparelhosDaLoja.get(s.id) ?? 0}
                  </td>
                  {/* O caminho para editar tem que estar na LISTA. Escondido
                      dentro da ficha, ninguém descobre que dá para corrigir. */}
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {podeEditar && (
                      <Link
                        href={`/lojas/${s.id}/editar`}
                        className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-surface-2"
                      >
                        {t.stores.edit}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="bg-surface px-4 py-8 text-center text-sm text-muted">
            {t.stores.empty}
          </p>
        )}
      </div>
    </div>
  );
}
