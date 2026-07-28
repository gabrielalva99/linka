import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { getSessionContext } from "@/lib/auth";
import { porCliente, tenantFilter } from "@/lib/tenant";
import { AutoRefresh } from "./auto-refresh";

type Issue = {
  device_id: string;
  code: string | null;
  name: string;
  loja: string | null;
  tipo: string;
  gravidade: string;
  detalhe: string;
  aberta: boolean;
  exclude_from_reports: boolean;
  store_id: string | null;
};

/**
 * A primeira tela responde uma pergunta só: o que está errado agora.
 *
 * Antes ela mostrava o papel do usuário e a lista de clientes, coisas que
 * ninguém precisa saber duas vezes. Com 250 aparelhos em 15 lojas, ninguém vai
 * abrir aparelho por aparelho para descobrir que a vitrine de uma loja apagou.
 *
 * Agrupa por LOJA porque é assim que a operação age: quem resolve vai até uma
 * loja, não até um aparelho.
 */
export default async function DashboardPage() {
  const ctx = await getSessionContext();
  const t = getMessages();
  const supabase = await createSupabaseServerClient();

  const filtro = await tenantFilter();
  const [{ data: issuesData, error: issuesError }, { count: totalDevices }] =
    await Promise.all([
      porCliente(
        supabase
          .from("v_device_issues")
          .select(
            "device_id, code, name, loja, store_id, tipo, gravidade, detalhe, aberta, exclude_from_reports",
          ),
        filtro,
      ),
      porCliente(
        supabase.from("devices").select("id", { count: "exact", head: true }),
        filtro,
      ),
    ]);

  // Falha de leitura NÃO pode virar "tudo certo". Esta tela existe para avisar
  // que algo caiu; se ela mesma cair em silêncio, mente exatamente na hora em
  // que mais importa: sessão expirada, banco fora do ar e frota saudável
  // produziam a mesma tela verde.
  if (issuesError) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="text-xl font-semibold">
          {t.dashboard.welcome}
          {ctx?.fullName ? `, ${ctx.fullName}` : ""}
        </h1>
        <div className="mt-6 rounded-xl border border-warning/40 bg-warning/10 p-6">
          <p className="text-lg font-semibold text-warning">{t.home.readFailed}</p>
          <p className="mt-1 text-sm text-muted">{t.home.readFailedHint}</p>
        </div>
        <AutoRefresh ms={30000} />
      </div>
    );
  }

  const issues = (issuesData ?? []) as Issue[];
  const criticos = issues.filter((i) => i.gravidade === "critico");
  const atencao = issues.filter((i) => i.gravidade !== "critico");
  const aparelhosComProblema = new Set(issues.map((i) => i.device_id)).size;
  const total = totalDevices ?? 0;

  // Por loja, com os críticos primeiro: é a ordem em que alguém vai agir.
  // Agrupa por id da loja, não pelo nome: duas lojas homônimas de redes
  // diferentes colapsariam no mesmo bloco e a pessoa iria ao endereço errado.
  const porLoja = new Map<string, { nome: string; lojaId: string | null; itens: Issue[] }>();
  for (const i of [...criticos, ...atencao]) {
    const chave = i.store_id ?? "sem-loja";
    const atual = porLoja.get(chave);
    porLoja.set(chave, {
      nome: i.loja ?? t.home.noStore,
      lojaId: i.store_id,
      itens: [...(atual?.itens ?? []), i],
    });
  }

  const rotulo: Record<string, string> = {
    fora_do_ar: t.home.offline,
    tela_vazia: t.home.blankScreen,
    sem_travas: t.home.unlocked,
    senha_de_tela: t.home.screenLock,
    atualizacao_travada: t.home.updateStuck,
    bateria_baixa: t.home.lowBattery,
    quente: t.home.hot,
    sem_loja: t.home.noStoreSet,
  };

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold">
        {t.dashboard.welcome}
        {ctx?.fullName ? `, ${ctx.fullName}` : ""}
      </h1>

      {issues.length === 0 ? (
        <div className="mt-6 rounded-xl border border-success/40 bg-success/5 p-6">
          <p className="text-lg font-semibold text-success">{t.home.allWell}</p>
          <p className="mt-1 text-sm text-muted">
            {t.home.allWellDetail.replace("{n}", String(total))}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <section className="rounded-xl border border-line bg-surface p-5">
              <h2 className="text-sm font-medium text-muted">{t.home.critical}</h2>
              <p
                className={`mt-1 text-2xl font-semibold ${
                  criticos.length > 0 ? "text-warning" : ""
                }`}
              >
                {criticos.length}
              </p>
            </section>
            <section className="rounded-xl border border-line bg-surface p-5">
              <h2 className="text-sm font-medium text-muted">{t.home.attention}</h2>
              <p className="mt-1 text-2xl font-semibold">{atencao.length}</p>
            </section>
            <section className="rounded-xl border border-line bg-surface p-5">
              <h2 className="text-sm font-medium text-muted">{t.home.devicesAffected}</h2>
              <p className="mt-1 text-2xl font-semibold">
                {aparelhosComProblema}
                <span className="text-base font-normal text-muted"> / {total}</span>
              </p>
            </section>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            {[...porLoja.entries()].map(([chave, grupo]) => (
              <section key={chave} className="rounded-xl border border-line bg-surface p-5">
                <h2 className="text-sm font-medium">
                  {grupo.lojaId ? (
                    <Link
                      href={`/lojas/${grupo.lojaId}`}
                      className="hover:text-primary hover:underline"
                    >
                      {grupo.nome}
                    </Link>
                  ) : (
                    grupo.nome
                  )}
                </h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {grupo.itens.map((i) => (
                    <li
                      key={`${i.device_id}-${i.tipo}`}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line pb-2 last:border-0 last:pb-0"
                    >
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          i.gravidade === "critico"
                            ? "bg-warning/15 text-warning"
                            : "bg-surface-2 text-muted"
                        }`}
                      >
                        {rotulo[i.tipo] ?? i.tipo}
                      </span>
                      <Link
                        href={`/frota/${i.device_id}`}
                        className="text-sm font-medium hover:text-primary hover:underline"
                      >
                        {i.code ? `${i.code} · ` : ""}
                        {i.name}
                      </Link>
                      <span className="text-xs text-muted">{i.detalhe}</span>
                      {i.exclude_from_reports && (
                        <span className="text-xs text-muted">({t.home.testDevice})</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      <AutoRefresh ms={30000} />
    </div>
  );
}
