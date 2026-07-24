import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { PositionForm } from "./position-form";
import { deletePosition } from "./actions";

type StoreDetail = {
  id: string;
  name: string;
  code: string | null;
  kind: string;
  city: string | null;
  state: string | null;
  country: string;
  timezone: string;
  retail_chains: { name: string | null } | { name: string | null }[] | null;
};

export default async function StoreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: store } = await supabase
    .from("stores")
    .select("id, name, code, kind, city, state, country, timezone, retail_chains(name)")
    .eq("id", id)
    .single<StoreDetail>();

  if (!store) notFound();

  const { data: positions } = await supabase
    .from("positions")
    .select("id, label")
    .eq("store_id", id)
    .order("label", { ascending: true });

  const t = getMessages();
  const rel = store.retail_chains;
  const chainName = (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "—";
  const kindLabel =
    store.kind === "shopping"
      ? t.stores.kindShopping
      : store.kind === "street"
        ? t.stores.kindStreet
        : t.stores.kindOther;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/lojas" className="text-sm text-muted hover:underline">
        ← {t.stores.title}
      </Link>

      <h1 className="mt-2 text-xl font-semibold">{store.name}</h1>
      <p className="mt-1 text-sm text-muted">
        {chainName} · {kindLabel}
        {store.city ? ` · ${store.city}${store.state ? `/${store.state}` : ""}` : ""}
        {` · ${store.country} · ${store.timezone}`}
        {store.code ? ` · ${store.code}` : ""}
      </p>

      <div className="mt-8">
        <h2 className="text-sm font-medium text-muted">{t.positions.title}</h2>

        <div className="mt-3">
          <PositionForm storeId={store.id} />
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-line">
          {positions && positions.length > 0 ? (
            <ul className="divide-y divide-line">
              {positions.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between bg-surface px-4 py-3 text-sm"
                >
                  <span>{p.label}</span>
                  <form action={deletePosition}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="store_id" value={store.id} />
                    <button
                      type="submit"
                      className="text-xs text-muted hover:text-danger"
                    >
                      {t.positions.delete}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="bg-surface px-4 py-6 text-center text-sm text-muted">
              {t.positions.empty}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
