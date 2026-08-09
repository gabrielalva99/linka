import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { podeOperarAgora } from "@/lib/perms";
import { porCliente, tenantFilter } from "@/lib/tenant";
import { dataHora } from "@/lib/datas";
import { LinhaPacote } from "./linha";

/**
 * O que o aparelho mediu e ninguém disse o que é.
 *
 * ESTA TELA FECHA UM BURACO QUE PARECIA UM DADO. O relatório responde "qual
 * recurso o cliente procura", e essa resposta é a promessa de venda do produto.
 * Só que o aparelho mede tudo que aparece na tela: quando um pacote novo não
 * está no catálogo, ele entra na conta como recurso testado, com nome de
 * programador. O número fica errado sem ninguém perceber.
 *
 * O contador já existia na tela inicial desde 30/07 — dizia "1 pacote medido sem
 * classificação" e não havia para onde ir. Aviso sem caminho é pior que aviso
 * nenhum: ele aparece todo dia, ninguém resolve, e a pessoa aprende a ignorar o
 * bloco inteiro de pendências.
 */
export default async function AplicativosPage() {
  const supabase = await createSupabaseServerClient();
  const filtro = await tenantFilter();
  const t = getMessages();
  const podeEditar = await podeOperarAgora();

  const [{ data: eventos }, { data: catalogo }] = await Promise.all([
    porCliente(
      supabase
        .from("device_events")
        .select("package, duration_seconds, device_id, created_at")
        .eq("kind", "app_usage")
        .not("package", "is", null),
      filtro,
    ),
    supabase.from("app_catalog").select("package, label, is_noise"),
  ]);

  const classificados = new Set((catalogo ?? []).map((c) => c.package as string));

  // Agrupa por pacote no servidor: são poucas linhas por natureza (pacote novo é
  // exceção), e agrupar aqui evita mandar o histórico inteiro para o navegador.
  type Resumo = {
    pacote: string;
    vezes: number;
    segundos: number;
    aparelhos: Set<string>;
    ultima: string;
  };
  const porPacote = new Map<string, Resumo>();
  for (const e of (eventos ?? []) as {
    package: string;
    duration_seconds: number | null;
    device_id: string;
    created_at: string;
  }[]) {
    if (!e.package || classificados.has(e.package)) continue;
    const atual = porPacote.get(e.package) ?? {
      pacote: e.package,
      vezes: 0,
      segundos: 0,
      aparelhos: new Set<string>(),
      ultima: e.created_at,
    };
    atual.vezes += 1;
    atual.segundos += e.duration_seconds ?? 0;
    atual.aparelhos.add(e.device_id);
    if (e.created_at > atual.ultima) atual.ultima = e.created_at;
    porPacote.set(e.package, atual);
  }
  const pendentes = [...porPacote.values()].sort((a, b) => b.vezes - a.vezes);

  const jaClassificados = (catalogo ?? []).length;
  const ruidos = (catalogo ?? []).filter((c) => c.is_noise).length;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dispositivos" className="text-sm text-muted hover:underline">
        ← {t.fleet.title}
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Aplicativos medidos</h1>
      <p className="mt-1 text-sm text-muted">
        O aparelho mede tudo que aparece na tela. Enquanto um aplicativo não é
        classificado, ele conta no relatório como recurso que o cliente
        experimentou — mesmo quando abriu sozinho.
      </p>

      {pendentes.length === 0 ? (
        <div className="mt-6 rounded-xl border border-line bg-surface p-6">
          <p className="text-sm">Nada pendente.</p>
          <p className="mt-1 text-xs text-muted">
            {jaClassificados} aplicativo(s) no catálogo, {ruidos} marcados como
            ruído. Quando um aplicativo novo aparecer num aparelho, ele surge aqui.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm font-medium text-warning">
            {pendentes.length} aguardando decisão
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {pendentes.map((p) =>
              podeEditar ? (
                <LinhaPacote
                  key={p.pacote}
                  pacote={p.pacote}
                  vezes={p.vezes}
                  segundos={p.segundos}
                  aparelhos={p.aparelhos.size}
                  ultimaVez={dataHora(p.ultima)}
                />
              ) : (
                <li
                  key={p.pacote}
                  className="rounded-xl border border-line bg-surface p-4"
                >
                  <p className="truncate font-mono text-xs text-muted">{p.pacote}</p>
                  <p className="mt-1 text-xs text-muted">
                    {p.vezes} medição(ões) · {p.segundos}s · {p.aparelhos.size}{" "}
                    aparelho(s)
                  </p>
                </li>
              ),
            )}
          </ul>
        </>
      )}

      {/* O catálogo inteiro fica visível de propósito: quando o relatório mostrar
          um recurso com número estranho, o primeiro lugar a conferir é se ele foi
          classificado certo — e uma classificação errada é invisível sem esta
          lista. */}
      {jaClassificados > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-muted hover:text-foreground">
            Já classificados ({jaClassificados})
          </summary>
          <ul className="mt-3 flex flex-col gap-1">
            {(catalogo ?? [])
              .slice()
              .sort((a, b) => String(a.label).localeCompare(String(b.label)))
              .map((c) => (
                <li
                  key={c.package as string}
                  className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-1.5 text-xs"
                >
                  <span className="truncate">{c.label as string}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-muted">{c.package as string}</span>
                    <span className={c.is_noise ? "text-muted" : "text-success"}>
                      {c.is_noise ? "ruído" : "recurso"}
                    </span>
                  </span>
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
