import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { porCliente, tenantFilter } from "@/lib/tenant";
import { StoreForm } from "./store-form";

export default async function NovaLojaPage() {
  const supabase = await createSupabaseServerClient();
  const { data: chains } = await porCliente(
    supabase.from("retail_chains").select("id, name"),
    await tenantFilter(),
  ).order("name", { ascending: true });
  const t = getMessages();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold">{t.stores.new}</h1>
      <div className="mt-6">
        <StoreForm chains={chains ?? []} />
      </div>
    </div>
  );
}
