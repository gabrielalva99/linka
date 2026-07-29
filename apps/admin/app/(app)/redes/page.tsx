import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { podeOperarAgora } from "@/lib/perms";
import { porCliente, tenantFilter } from "@/lib/tenant";
import { lojasPorRede } from "@/lib/contagens";
import { CreateChainForm } from "./create-form";
import { ChainRow } from "./chain-row";

export default async function RedesPage() {
  const supabase = await createSupabaseServerClient();
  // A contagem de lojas vem junto: rede sem saber quantas lojas tem é um nome
  // solto, e é a contagem que diz se dá para excluir.
  const filtro = await tenantFilter();
  const [{ data: chains }, lojas] = await Promise.all([
    porCliente(
      supabase.from("retail_chains").select("id, name"),
      filtro,
    ).order("name", { ascending: true }),
    // Loja DESATIVADA nao conta: a contagem embutida somava as desativadas e a
    // rede aparecia maior do que a operacao real dela.
    lojasPorRede(supabase, filtro),
  ]);
  const t = getMessages();
  const podeEditar = await podeOperarAgora();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">{t.chains.title}</h1>

      {podeEditar && (
        <div className="mt-6">
          <CreateChainForm />
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-line">
        {chains && chains.length > 0 ? (
          <ul className="divide-y divide-line">
            {chains.map((c) => (
              <ChainRow
                key={c.id as string}
                id={c.id as string}
                nome={c.name as string}
                lojas={
                  lojas.get(c.id as string) ?? 0
                }
                podeEditar={podeEditar}
              />
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
