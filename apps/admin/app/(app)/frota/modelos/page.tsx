import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { podeOperarAgora } from "@/lib/perms";
import { porCliente, tenantFilter } from "@/lib/tenant";
import { aparelhosPorModelo } from "@/lib/contagens";
import { CreateModelForm } from "./create-form";
import { ModelRow } from "./model-row";

export default async function ModelosPage() {
  const supabase = await createSupabaseServerClient();
  const filtro = await tenantFilter();
  // A contagem vem de view agrupada, e nao da contagem embutida: a embutida nao
  // aceita filtro e somava aparelho arquivado, inflando o peso de cada modelo.
  const [{ data: models }, aparelhos] = await Promise.all([
    porCliente(
      supabase.from("device_models").select("id, name, line"),
      filtro,
    )
      .order("line", { ascending: true })
      .order("name", { ascending: true }),
    aparelhosPorModelo(supabase, filtro),
  ]);
  const t = getMessages();
  const podeEditar = await podeOperarAgora();

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/frota" className="text-sm text-muted hover:underline">
        ← {t.fleet.title}
      </Link>
      <h1 className="mt-2 text-xl font-semibold">{t.models.title}</h1>

      {podeEditar && (
        <div className="mt-6">
          <CreateModelForm />
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-line">
        {models && models.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{t.models.name}</th>
                <th className="px-4 py-2 font-medium">{t.models.line}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {models.map((m) => (
                <ModelRow
                  key={m.id as string}
                  id={m.id as string}
                  nome={m.name as string}
                  linha={m.line as string | null}
                  aparelhos={aparelhos.get(m.id as string) ?? 0}
                  podeEditar={podeEditar}
                />
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
