import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { CreateModelForm } from "./create-form";

export default async function ModelosPage() {
  const supabase = await createSupabaseServerClient();
  const { data: models } = await supabase
    .from("device_models")
    .select("id, name, line")
    .order("line", { ascending: true })
    .order("name", { ascending: true });
  const t = getMessages();

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/frota" className="text-sm text-muted hover:underline">
        ← {t.fleet.title}
      </Link>
      <h1 className="mt-2 text-xl font-semibold">{t.models.title}</h1>

      <div className="mt-6">
        <CreateModelForm />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-line">
        {models && models.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{t.models.name}</th>
                <th className="px-4 py-2 font-medium">{t.models.line}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {models.map((m) => (
                <tr key={m.id} className="bg-surface">
                  <td className="px-4 py-3 font-medium">{m.name}</td>
                  <td className="px-4 py-3 text-muted">{m.line ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="bg-surface px-4 py-6 text-center text-sm text-muted">
            {t.models.empty}
          </p>
        )}
      </div>
    </div>
  );
}
