import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { PublishForm } from "./publish-form";
import { RollbackButton } from "./rollback-button";

type Release = {
  id: string;
  version: string;
  notes: string | null;
  is_current: boolean;
  created_at: string;
};

export default async function VersoesPage() {
  const supabase = await createSupabaseServerClient();
  const t = getMessages();

  const [{ data: releases }, { data: devices }] = await Promise.all([
    supabase
      .from("agent_releases")
      .select("id, version, notes, is_current, created_at")
      .order("created_at", { ascending: false }),
    // Quem já atualizou e quem não: a versão publicada não é a versão instalada.
    supabase.from("devices").select("agent_version, update_error"),
  ]);

  const lista = (releases ?? []) as Release[];
  const atual = lista.find((r) => r.is_current) ?? null;
  const frota = devices ?? [];
  const naVersao = atual
    ? frota.filter((d) => d.agent_version === atual.version).length
    : 0;
  const travados = frota.filter((d) => d.update_error).length;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/frota" className="text-sm text-muted hover:underline">
        ← {t.fleet.title}
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Versões do agente</h1>
      <p className="mt-1 text-sm text-muted">
        O aparelho pergunta a cada minuto se existe versão mais nova e se instala
        sozinho. Não precisa de cabo nem de ninguém na loja.
      </p>

      <dl className="mt-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-line bg-surface p-4">
          <dt className="text-xs text-muted">Versão publicada</dt>
          <dd className="mt-1 text-lg font-semibold text-brand-500">
            {atual?.version ?? "—"}
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <dt className="text-xs text-muted">Já atualizados</dt>
          <dd className="mt-1 text-lg font-semibold">
            {naVersao} de {frota.length}
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <dt className="text-xs text-muted">Com problema</dt>
          <dd
            className={`mt-1 text-lg font-semibold ${travados > 0 ? "text-warning" : ""}`}
          >
            {travados}
          </dd>
        </div>
      </dl>

      <h2 className="mt-8 text-sm font-medium text-muted">Publicar nova versão</h2>
      <PublishForm />

      <h2 className="mt-8 text-sm font-medium text-muted">Histórico</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        {lista.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Versão</th>
                <th className="px-4 py-2 font-medium">Novidades</th>
                <th className="px-4 py-2 font-medium">Publicada em</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lista.map((r) => (
                <tr key={r.id} className="bg-surface">
                  <td className="px-4 py-3 font-medium">
                    {r.version}
                    {r.is_current && (
                      <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">
                        no ar
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{r.notes ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    {new Date(r.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!r.is_current && <RollbackButton id={r.id} version={r.version} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="bg-surface px-4 py-6 text-center text-sm text-muted">
            Nenhuma versão publicada ainda.
          </p>
        )}
      </div>
    </div>
  );
}
