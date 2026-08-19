import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { ehOperadorDaPlataformaAgora } from "@/lib/perms";
import { porCliente, tenantFilter } from "@/lib/tenant";
import { dataHora } from "@/lib/datas";
import { LinhaPacote } from "./linha";
import { LinhaClassificada } from "./linha-classificada";

/**
 * O que o aparelho mediu e ninguém disse o que é.
 *
 * ESTA TELA FECHA UM BURACO QUE PARECIA UM DADO. O relatório responde "qual
 * recurso o cliente procura", e essa resposta é a promessa de venda do produto.
 * Só que o aparelho mede tudo que aparece na tela: quando um aplicativo novo não
 * está identificado, ele entra na conta como recurso testado, com nome de
 * programador. O número fica errado sem ninguém perceber.
 *
 * O contador já existia na tela inicial desde 30/07 — dizia "1 pacote medido sem
 * classificação" e não havia para onde ir. Aviso sem caminho é pior que aviso
 * nenhum: aparece todo dia, ninguém resolve, e a pessoa aprende a ignorar o bloco
 * inteiro de pendências.
 */

/** Segundos em algo que se lê: "3h12", "44min", "18s". */
function tempo(segundos: number): string {
  if (segundos < 60) return `${segundos}s`;
  if (segundos < 3600) return `${Math.round(segundos / 60)}min`;
  const h = Math.floor(segundos / 3600);
  const m = Math.round((segundos % 3600) / 60);
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export default async function AplicativosPage() {
  const supabase = await createSupabaseServerClient();
  const filtro = await tenantFilter();
  const t = getMessages();
  // Quem identifica é o operador da plataforma, porque o catálogo é global e vale
  // para todas as marcas. A tela precisa concordar com a política do banco —
  // oferecer o botão a quem o banco recusa não é generosidade.
  const podeEditar = await ehOperadorDaPlataformaAgora();

  const [{ data: eventos }, { data: catalogo }, { data: rotulosDoAparelho }] =
    await Promise.all([
    porCliente(
      supabase
        .from("device_events")
        .select("package, duration_seconds, device_id, created_at")
        .eq("kind", "app_usage")
        .not("package", "is", null)
        // JANELA E TETO EXPLÍCITOS.
        //
        // Sem eles a API corta em 1000 linhas por padrão, em silêncio: com 250
        // aparelhos medindo uso, o teto é batido em horas, os números da tela
        // ficam errados sem aviso, e um aplicativo que só apareceu fora das mil
        // primeiras SOME da lista — o buraco que esta tela existe para fechar
        // continua aberto, agora invisível.
        //
        // 30 dias é a janela que importa: aplicativo que ninguém abre há um mês
        // não é pendência de decisão, é histórico.
        .gte("created_at", new Date(Date.now() - 30 * 24 * 3600_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(5000),
      filtro,
    ),
    supabase.from("app_catalog").select("package, label, is_noise"),
    // O NOME QUE O PRÓPRIO APARELHO DÁ ao pacote. É a melhor sugestão que
    // existe: o Android já mostra esse texto para o cliente na loja.
    porCliente(supabase.from("device_apps").select("package, label"), filtro),
  ]);

  const classificados = new Set((catalogo ?? []).map((c) => c.package as string));

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
  // O rótulo que os APARELHOS reportam, por pacote. Quando vários discordam
  // (idioma, versão do sistema), vale o mais comum — mesma regra do relatório,
  // para a tela de classificação e o relatório nunca sugerirem nomes diferentes
  // para a mesma coisa.
  const votos = new Map<string, Map<string, number>>();
  for (const r of (rotulosDoAparelho ?? []) as { package: string; label: string }[]) {
    if (!r.label || r.label === r.package) continue;
    const m = votos.get(r.package) ?? new Map<string, number>();
    m.set(r.label, (m.get(r.label) ?? 0) + 1);
    votos.set(r.package, m);
  }
  const rotuloDoAparelho = new Map<string, string>();
  for (const [pacote, m] of votos) {
    const melhor = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (melhor) rotuloDoAparelho.set(pacote, melhor[0]);
  }

  const pendentes = [...porPacote.values()].sort((a, b) => b.vezes - a.vezes);

  const lista = (catalogo ?? []) as { package: string; label: string; is_noise: boolean }[];
  const jaClassificados = lista.length;
  const ruidos = lista.filter((c) => c.is_noise).length;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dispositivos" className="text-sm text-muted hover:underline">
        ← {t.fleet.title}
      </Link>
      <h1 className="mt-2 text-xl font-semibold">{t.apps.title}</h1>
      <p className="mt-1 text-sm text-muted">{t.apps.subtitle}</p>

      {/* Quem não identifica precisa saber que não é com ele — senão fica olhando
          uma lista de nomes técnicos sem botão, sem entender o que se espera. */}
      {!podeEditar && (
        <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-xs text-muted">
          {t.apps.readOnly}
        </p>
      )}

      {pendentes.length === 0 ? (
        <div className="mt-6 rounded-xl border border-line bg-surface p-6">
          <p className="text-sm">{t.apps.pendingNone}</p>
          <p className="mt-1 text-xs text-muted">
            {t.apps.pendingNoneHint
              .replace("{n}", String(jaClassificados))
              .replace("{r}", String(ruidos))}
          </p>
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm font-medium text-warning">
            {t.apps.waiting.replace("{n}", String(pendentes.length))}
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {pendentes.map((p) =>
              podeEditar ? (
                <LinhaPacote
                  key={p.pacote}
                  pacote={p.pacote}
                  sugestaoDoAparelho={rotuloDoAparelho.get(p.pacote)}
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
                    {t.apps.measured
                      .replace("{n}", String(p.vezes))
                      .replace("{t}", tempo(p.segundos))
                      .replace("{d}", String(p.aparelhos.size))}
                  </p>
                </li>
              ),
            )}
          </ul>
        </>
      )}

      {/* O catálogo inteiro serve para conferência: quando o relatório mostrar um
          recurso com número estranho, o primeiro lugar a olhar é se ele foi
          identificado certo — e identificação errada é invisível sem esta lista.
          Só que o catálogo é GLOBAL: mostrá-lo a qualquer pessoa entrega a uma
          marca quais aplicativos a concorrente expõe na vitrine dela. Fica com
          quem opera a plataforma, que já enxerga todos os clientes. */}
      {podeEditar && jaClassificados > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-muted hover:text-foreground">
            {t.apps.classified.replace("{n}", String(jaClassificados))}
          </summary>
          <ul className="mt-3 flex flex-col gap-1">
            {lista
              .slice()
              .sort((a, b) => String(a.label).localeCompare(String(b.label)))
              .map((c) => (
                <LinhaClassificada
                  key={c.package}
                  pacote={c.package}
                  rotulo={c.label}
                  ehRuido={c.is_noise}
                />
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
