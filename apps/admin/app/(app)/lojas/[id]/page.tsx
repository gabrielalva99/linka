import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { PositionForm } from "./position-form";
import { PositionRow } from "./position-row";

type StoreDetail = {
  id: string;
  name: string;
  code: string | null;
  kind: string;
  city: string | null;
  state: string | null;
  country: string;
  timezone: string;
  opens_at: string | null;
  closes_at: string | null;
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
    .select("id, name, code, kind, city, state, country, timezone, opens_at, closes_at, retail_chains(name)")
    .eq("id", id)
    .single<StoreDetail>();

  if (!store) notFound();

  const { data: positions } = await supabase
    .from("positions")
    .select("id, label")
    .eq("store_id", id)
    .order("label", { ascending: true });

  // Os aparelhos DESTA loja. O painel inicial manda a pessoa para a loja onde
  // está o problema, e até agora a tela da loja não mostrava aparelho nenhum:
  // o caminho terminava exatamente onde o trabalho começa.
  const { data: aparelhos } = await supabase
    .from("devices")
    .select(
      "id, code, name, status, last_seen_at, playing_url, kiosk_locked, positions(label)",
    )
    .eq("store_id", id)
    .order("code", { ascending: true });

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

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{store.name}</h1>
        <Link
          href={`/lojas/${store.id}/editar`}
          className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-surface-2"
        >
          {t.stores.edit}
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">
        {chainName} · {kindLabel}
        {store.city ? ` · ${store.city}${store.state ? `/${store.state}` : ""}` : ""}
        {` · ${store.country} · ${store.timezone}`}
        {store.code ? ` · ${store.code}` : ""}
      </p>
      <p className="mt-1 text-sm text-muted">
        {t.stores.hoursLine
          .replace("{abre}", String(store.opens_at ?? "09:00").slice(0, 5))
          .replace("{fecha}", String(store.closes_at ?? "22:00").slice(0, 5))}
      </p>

      <div className="mt-8">
        <h2 className="text-sm font-medium text-muted">
          {t.stores.devicesHere.replace("{n}", String(aparelhos?.length ?? 0))}
        </h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-line">
          {aparelhos && aparelhos.length > 0 ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {aparelhos.map((a) => {
                  const visto = a.last_seen_at
                    ? Date.now() - new Date(a.last_seen_at as string).getTime()
                    : null;
                  const fora = visto == null || visto > 3 * 60 * 1000;
                  const pos = Array.isArray(a.positions)
                    ? a.positions[0]?.label
                    : (a.positions as { label: string | null } | null)?.label;
                  return (
                    <tr key={a.id as string} className="bg-surface">
                      <td className="px-4 py-3">
                        <Link
                          href={`/frota/${a.id}`}
                          className="font-medium hover:text-primary hover:underline"
                        >
                          {a.code ? `${a.code} · ` : ""}
                          {a.name as string}
                        </Link>
                        {pos && (
                          <span className="ml-2 text-xs text-muted">{pos}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-xs">
                        <span className={fora ? "text-warning" : "text-muted"}>
                          {fora ? t.stores.deviceOffline : t.stores.deviceOnline}
                        </span>
                        {!fora && !a.playing_url && (
                          <span className="ml-2 text-warning">
                            {t.stores.deviceNoVideo}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="bg-surface px-4 py-6 text-center text-sm text-muted">
              {t.stores.noDevicesHere}
            </p>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-medium text-muted">{t.positions.title}</h2>

        <div className="mt-3">
          <PositionForm storeId={store.id} />
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-line">
          {positions && positions.length > 0 ? (
            <ul className="divide-y divide-line">
              {positions.map((p) => (
                <PositionRow
                  key={p.id as string}
                  id={p.id as string}
                  rotulo={p.label as string}
                  storeId={store.id}
                />
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
