import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";

type StoreRow = {
  id: string;
  name: string;
  code: string | null;
  kind: string;
  city: string | null;
  state: string | null;
  country: string;
  retail_chains: { name: string | null } | { name: string | null }[] | null;
};

export default async function LojasPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("stores")
    .select("id, name, code, kind, city, state, country, retail_chains(name)")
    .order("name", { ascending: true });
  const t = getMessages();
  const stores = (data ?? []) as StoreRow[];

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
        <Link
          href="/lojas/nova"
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          {t.stores.new}
        </Link>
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
                  <td className="px-4 py-3 text-muted">{s.code ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{chainName(s.retail_chains)}</td>
                  <td className="px-4 py-3 text-muted">{kindLabel(s.kind)}</td>
                  <td className="px-4 py-3 text-muted">
                    {s.city ? `${s.city}${s.state ? `/${s.state}` : ""}` : "—"}
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
