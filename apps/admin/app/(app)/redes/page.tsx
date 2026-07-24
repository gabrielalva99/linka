import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { CreateChainForm } from "./create-form";

export default async function RedesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: chains } = await supabase
    .from("retail_chains")
    .select("id, name")
    .order("name", { ascending: true });
  const t = getMessages();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">{t.chains.title}</h1>

      <div className="mt-6">
        <CreateChainForm />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-line">
        {chains && chains.length > 0 ? (
          <ul className="divide-y divide-line">
            {chains.map((c) => (
              <li key={c.id} className="bg-surface px-4 py-3 text-sm">
                {c.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="bg-surface px-4 py-6 text-center text-sm text-muted">
            {t.chains.empty}
          </p>
        )}
      </div>
    </div>
  );
}
