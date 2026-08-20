import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { getSessionContext } from "@/lib/auth";
import { ehOperadorDaPlataforma } from "@/lib/perms";
import { PublishForm } from "./publish-form";
import { RollbackButton } from "./rollback-button";
import { dataHora } from "@/lib/datas";

type Release = {
  id: string;
  version: string;
  notes: string | null;
  is_current: boolean;
  created_at: string;
  /** Nulo = vale para todos os aparelhos. */
  target_device_type: string | null;
};

/** Como o alvo é dito na tela. Nulo vira "Todos". */
const NOME_DO_ALVO: Record<string, string> = {
  todos: "Todos",
  smartphone: "Celulares",
  tablet: "Tablets",
  tv: "TVs",
  notebook: "Notebooks",
  other: "Outros",
};

function nomeDoAlvo(alvo: string | null) {
  return NOME_DO_ALVO[alvo ?? "todos"] ?? (alvo ?? "Todos");
}

export default async function VersoesPage() {
  const supabase = await createSupabaseServerClient();
  const t = getMessages();
  // Publicar APK muda o software de TODA a frota, de todos os clientes.
  // Não é permissão de agência: é da plataforma.
  if (!ehOperadorDaPlataforma(await getSessionContext())) redirect("/dispositivos");

  const [{ data: releases }, { data: devices }] = await Promise.all([
    supabase
      .from("agent_releases")
      .select("id, version, notes, is_current, created_at, target_device_type")
      .order("created_at", { ascending: false }),
    // Quem já atualizou e quem não: a versão publicada não é a versão instalada.
    //
    // Sem is_active esta tela dizia "2 de 6" com dois aparelhos na mesa e quatro
    // arquivados — e era a terceira tela do painel a contar a frota de um jeito
    // diferente das outras duas.
    //
    // De propósito NÃO usa emOperacao(): aqui não entra recorte de cliente. Só
    // quem opera a plataforma abre esta tela (o redirect acima), e publicar APK
    // atinge a frota de TODOS os clientes de uma vez. Contar só o cliente
    // escolhido no seletor esconderia justamente os aparelhos que a publicação
    // também vai mexer. O texto abaixo diz isso em voz alta.
    supabase
      .from("devices")
      .select("agent_version, update_error, device_type")
      .eq("is_active", true),
  ]);

  const lista = (releases ?? []) as Release[];
  const frota = (devices ?? []) as {
    agent_version: string | null;
    update_error: string | null;
    device_type: string;
  }[];

  // Pode existir MAIS DE UMA versão no ar ao mesmo tempo: uma geral e uma por
  // tipo de aparelho.
  const noAr = lista.filter((r) => r.is_current);
  const geral = noAr.find((r) => r.target_device_type === null) ?? null;

  /**
   * Qual versão ESTE aparelho obedece.
   *
   * Repete de propósito a regra de `release_atual` no banco: a mirada no tipo
   * dele vence a geral. Se as duas discordassem, esta tela diria que a frota
   * está atualizada enquanto o aparelho busca outra coisa — e a contagem viraria
   * mentira justo na tela que existe para dar confiança antes de publicar.
   */
  function releaseDe(tipo: string): Release | null {
    return noAr.find((r) => r.target_device_type === tipo) ?? geral;
  }

  // Uma linha por versão no ar, com a população que de fato a obedece: um
  // aparelho conta para UMA versão só, nunca para duas.
  const placar = noAr.map((r) => {
    const meus = frota.filter((d) => releaseDe(d.device_type)?.id === r.id);
    return {
      release: r,
      total: meus.length,
      atualizados: meus.filter((d) => d.agent_version === r.version).length,
    };
  });

  const travados = frota.filter((d) => d.update_error).length;
  // Aparelho de um tipo sem versão nenhuma publicada: só acontece se não houver
  // versão geral. Aparece aqui para não sumir da conta em silêncio.
  const semVersao = frota.filter((d) => releaseDe(d.device_type) === null).length;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dispositivos" className="text-sm text-muted hover:underline">
        ← {t.fleet.title}
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Versões do agente</h1>
      <p className="mt-1 text-sm text-muted">
        O aparelho pergunta a cada minuto se existe versão mais nova e se instala
        sozinho. Não precisa de cabo nem de ninguém na loja.
      </p>
      <p className="mt-1 text-sm text-muted">
        Você escolhe quem recebe: todos os aparelhos, só os celulares ou só as
        TVs. O que for <strong className="font-medium text-foreground">para
        todos</strong> atinge{" "}
        <strong className="font-medium text-foreground">a frota inteira, de
        todos os clientes</strong> — e as contagens abaixo também. Aparelho
        arquivado não entra.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs text-muted">No ar agora</p>
          {placar.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {placar.map((p) => (
                <li key={p.release.id} className="flex items-baseline gap-2">
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                    {nomeDoAlvo(p.release.target_device_type)}
                  </span>
                  <span className="text-lg font-semibold text-brand-500">
                    {p.release.version}
                  </span>
                  <span className="text-sm text-muted">
                    {p.atualizados} de {p.total} atualizados
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Nenhuma versão publicada ainda.</p>
          )}
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs text-muted">Com problema</p>
          <p
            className={`mt-1 text-lg font-semibold ${travados > 0 ? "text-warning" : ""}`}
          >
            {travados}
          </p>
          {semVersao > 0 && (
            <p className="mt-2 text-xs text-warning">
              {semVersao}{" "}
              {semVersao === 1 ? "aparelho está" : "aparelhos estão"} sem versão
              publicada para o tipo dele.
            </p>
          )}
        </div>
      </div>

      <h2 className="mt-8 text-sm font-medium text-muted">Publicar nova versão</h2>
      <PublishForm />

      <h2 className="mt-8 text-sm font-medium text-muted">Histórico</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        {lista.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                <th className="whitespace-nowrap px-4 py-2 font-medium">Versão</th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">Para</th>
                <th className="w-full px-4 py-2 font-medium">Novidades</th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">
                  Publicada em
                </th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lista.map((r) => (
                <tr key={r.id} className="bg-surface">
                  {/* A coluna encolhe até o conteúdo: sem isso a etiqueta "no ar"
                      quebrava no meio e virava "no / ar". */}
                  <td className="whitespace-nowrap px-4 py-3 font-medium">
                    {r.version}
                    {r.is_current && (
                      <span className="ml-2 whitespace-nowrap rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">
                        no ar
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {nomeDoAlvo(r.target_device_type)}
                  </td>
                  <td className="px-4 py-3 text-muted">{r.notes ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {dataHora(r.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
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
