import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { EditStoreForm } from "./edit-form";

export default async function EditarLojaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const t = getMessages();

  const [{ data: store }, { data: chains }, { count }] = await Promise.all([
    supabase
      .from("stores")
      .select(
        "id, name, code, chain_id, kind, city, state, country, timezone, opens_at, closes_at",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("retail_chains").select("id, name").order("name"),
    // Quantos aparelhos obedecem a este horário. Muda o peso do que a pessoa
    // está prestes a salvar.
    supabase
      .from("devices")
      .select("id", { count: "exact", head: true })
      .eq("store_id", id),
  ]);

  if (!store) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/lojas/${id}`} className="text-sm text-muted hover:underline">
        ← {store.name as string}
      </Link>
      <h1 className="mt-2 text-xl font-semibold">{t.stores.editTitle}</h1>

      <div className="mt-6">
        <EditStoreForm
          store={{
            id: store.id as string,
            name: store.name as string,
            code: store.code as string | null,
            chainId: store.chain_id as string | null,
            kind: (store.kind as string) ?? "other",
            city: store.city as string | null,
            state: store.state as string | null,
            country: (store.country as string) ?? "BR",
            timezone: (store.timezone as string) ?? "America/Sao_Paulo",
            opensAt: (store.opens_at as string) ?? "09:00",
            closesAt: (store.closes_at as string) ?? "22:00",
          }}
          chains={(chains ?? []).map((c) => ({
            id: c.id as string,
            name: c.name as string,
          }))}
          aparelhos={count ?? 0}
        />
      </div>
    </div>
  );
}
