import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { ReportFilters } from "./report-filters";

type Proibido = {
  loja: string;
  aparelho: string;
  codigo: string | null;
  app: string;
  vezes: number;
  ultima_vez: string;
};

type Report = {
  dias: number;
  visitas: number;
  segundos_uso: number;
  segundos_vitrine: number;
  lojas_com_dado: number;
  aparelhos_fora: number;
  por_aparelho: {
    codigo: string;
    aparelho: string;
    loja: string;
    visitas: number;
    segundos: number;
  }[];
  por_loja: {
    loja: string;
    rede: string;
    visitas: number;
    segundos: number;
    segundos_vitrine: number;
  }[];
  por_rede: { rede: string; visitas: number; segundos: number }[];
  por_recurso: {
    recurso: string;
    categoria: string | null;
    sessoes: number;
    segundos: number;
  }[];
  por_dia: { dia: string; visitas: number; segundos: number }[];
  proibidos_abertos: Proibido[];
  proibidos_corrigidos: Proibido[];
  por_hora: { hora: number; visitas: number }[];
  aparelhos_sem_visita: { aparelho: string; codigo: string | null; loja: string }[];
};

/** "2h10" / "5min" / "45s". Relatório de varejo não se lê em segundos. */
function tempo(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/** Visitas por hora de vitrine. É o que compara lojas de tamanhos diferentes. */
function taxa(visitas: number, segundosVitrine: number): string {
  if (segundosVitrine <= 0) return "—";
  return (visitas / (segundosVitrine / 3600)).toFixed(1);
}

const PERIODOS = [7, 30, 90];

/**
 * A visão que junta a frota inteira.
 *
 * O dado de interação só existia dentro de um aparelho, então ninguém
 * conseguia responder "como foi a semana" nem "qual loja converte mais", que
 * são exatamente as perguntas de quem senta na frente da marca.
 */
export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{
    dias?: string;
    rede?: string;
    loja?: string;
    aparelho?: string;
  }>;
}) {
  const { dias, rede, loja, aparelho } = await searchParams;
  const periodo = PERIODOS.includes(Number(dias)) ? Number(dias) : 7;
  const t = getMessages();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("fleet_report", {
    p_days: periodo,
    p_rede: rede || null,
    p_loja: loja || null,
    p_aparelho: aparelho || null,
  });

  // As opções dos filtros vêm do cadastro, não do resultado: uma loja que ficou
  // sem movimento no período tem que continuar selecionável, senão a pessoa não
  // consegue perguntar justamente sobre a loja que parou.
  const [{ data: redesData }, { data: lojasData }, { data: aparelhosData }] =
    await Promise.all([
      supabase.from("retail_chains").select("name").order("name"),
      supabase.from("stores").select("name").order("name"),
      supabase
        .from("devices")
        .select("code, name")
        .eq("exclude_from_reports", false)
        .order("code"),
    ]);
  const r = data as Report | null;

  if (error || !r) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="text-xl font-semibold">{t.reports.title}</h1>
        <p className="mt-6 rounded-xl border border-warning/40 bg-warning/10 p-5 text-sm text-warning">
          {t.reports.readFailed}
        </p>
      </div>
    );
  }

  const semDado = r.visitas === 0;
  const maiorHora = Math.max(1, ...r.por_hora.map((h) => h.visitas));
  const maiorRecurso = Math.max(1, ...r.por_recurso.map((x) => x.segundos));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t.reports.title}</h1>
        <div className="flex items-center gap-2">
          {PERIODOS.map((d) => (
            <Link
              key={d}
              href={`/relatorios?dias=${d}`}
              className={`rounded-md border px-3 py-1.5 text-xs ${
                d === periodo
                  ? "border-primary text-primary"
                  : "border-line text-muted hover:bg-surface-2"
              }`}
            >
              {t.reports.days.replace("{n}", String(d))}
            </Link>
          ))}
          <a
            href={`/relatorios/exportar?dias=${periodo}${rede ? `&rede=${encodeURIComponent(rede)}` : ""}${loja ? `&loja=${encodeURIComponent(loja)}` : ""}${aparelho ? `&aparelho=${encodeURIComponent(aparelho)}` : ""}`}
            className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-surface-2"
          >
            {t.reports.export}
          </a>
        </div>
      </div>

      <ReportFilters
        redes={(redesData ?? []).map((r) => r.name as string)}
        lojas={(lojasData ?? []).map((l) => l.name as string)}
        aparelhos={(aparelhosData ?? []).map((a) => ({
          codigo: (a.code as string) ?? "",
          nome: a.name as string,
        }))}
        rede={rede ?? ""}
        loja={loja ?? ""}
        aparelho={aparelho ?? ""}
      />

      {/* Aparelho de bancada sai do relatório de propósito. Sem dizer isso, o
          número some e ninguém confia mais no resto da tela. */}
      {r.aparelhos_fora > 0 && (
        <p className="mt-3 text-xs text-muted">
          {t.reports.excluded.replace("{n}", String(r.aparelhos_fora))}
        </p>
      )}

      {semDado ? (
        <div className="mt-6 rounded-xl border border-line bg-surface p-6">
          <p className="text-sm text-muted">{t.reports.empty}</p>
        </div>
      ) : (
        <>
          {/* Aberto pede ação hoje. Corrigido é história, e história em caixa
              amarela ensina a pessoa a ignorar caixa amarela. */}
          {r.proibidos_abertos?.length > 0 && (
            <div className="mt-6 rounded-xl border border-warning/40 bg-warning/10 p-5">
              <p className="text-sm font-semibold text-warning">
                {t.reports.blockedOpen}
              </p>
              <p className="mt-1 text-xs text-muted">{t.reports.blockedOpenHint}</p>
              <ul className="mt-2 flex flex-col gap-1 text-xs">
                {r.proibidos_abertos.map((a) => (
                  <li key={`${a.codigo}-${a.app}`} className="text-muted">
                    <span className="text-warning">{a.app}</span>
                    {` · ${a.codigo ? `${a.codigo} · ` : ""}${a.aparelho} · ${a.loja} · `}
                    {t.reports.times.replace("{n}", String(a.vezes))}
                    {` · ${a.ultima_vez}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {r.proibidos_corrigidos?.length > 0 && (
            <details className="mt-6 rounded-xl border border-line bg-surface p-5">
              <summary className="cursor-pointer text-sm text-muted">
                {t.reports.blockedFixed.replace(
                  "{n}",
                  String(r.proibidos_corrigidos.length),
                )}
              </summary>
              <p className="mt-2 text-xs text-muted">{t.reports.blockedFixedHint}</p>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-muted">
                {r.proibidos_corrigidos.map((a) => (
                  <li key={`${a.codigo}-${a.app}`}>
                    {`${a.app} · ${a.codigo ? `${a.codigo} · ` : ""}${a.aparelho} · ${a.loja} · `}
                    {t.reports.times.replace("{n}", String(a.vezes))}
                    {` · ${t.reports.lastTime} ${a.ultima_vez}`}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-line bg-surface p-5">
              <dt className="text-xs text-muted">{t.reports.visits}</dt>
              <dd className="mt-1 text-2xl font-semibold text-brand-500">{r.visitas}</dd>
            </div>
            <div className="rounded-xl border border-line bg-surface p-5">
              <dt className="text-xs text-muted">{t.reports.usage}</dt>
              <dd className="mt-1 text-2xl font-semibold">{tempo(r.segundos_uso)}</dd>
              <dd className="mt-0.5 text-xs text-muted">
                {r.visitas > 0 &&
                  t.reports.perVisit.replace(
                    "{t}",
                    tempo(Math.round(r.segundos_uso / r.visitas)),
                  )}
              </dd>
            </div>
            <div className="rounded-xl border border-line bg-surface p-5">
              <dt className="text-xs text-muted">{t.reports.showcase}</dt>
              <dd className="mt-1 text-2xl font-semibold">{tempo(r.segundos_vitrine)}</dd>
            </div>
            <div className="rounded-xl border border-line bg-surface p-5">
              <dt className="text-xs text-muted">{t.reports.rate}</dt>
              <dd className="mt-1 text-2xl font-semibold">
                {taxa(r.visitas, r.segundos_vitrine)}
                <span className="text-base font-normal text-muted">/h</span>
              </dd>
            </div>
          </dl>

          <section className="mt-8">
            <h2 className="text-sm font-medium text-muted">{t.reports.byStore}</h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-surface-2 text-left text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">{t.reports.store}</th>
                    <th className="px-4 py-2 font-medium">{t.reports.chain}</th>
                    <th className="whitespace-nowrap px-4 py-2 font-medium">
                      {t.reports.visits}
                    </th>
                    <th className="whitespace-nowrap px-4 py-2 font-medium">
                      {t.reports.usage}
                    </th>
                    <th className="whitespace-nowrap px-4 py-2 font-medium">
                      {t.reports.rate}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.por_loja.map((l) => (
                    <tr key={`${l.rede}-${l.loja}`} className="bg-surface">
                      <td className="px-4 py-3 font-medium">{l.loja}</td>
                      <td className="px-4 py-3 text-muted">{l.rede}</td>
                      <td className="px-4 py-3">{l.visitas}</td>
                      <td className="px-4 py-3 text-muted">{tempo(l.segundos)}</td>
                      <td className="px-4 py-3 text-muted">
                        {taxa(l.visitas, l.segundos_vitrine)}/h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">{t.reports.rateHint}</p>
          </section>

          {r.por_aparelho?.length > 1 && (
            <section className="mt-8">
              <h2 className="text-sm font-medium text-muted">{t.reports.byDevice}</h2>
              <div className="mt-3 overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="bg-surface-2 text-left text-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">{t.reports.device}</th>
                      <th className="px-4 py-2 font-medium">{t.reports.store}</th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">
                        {t.reports.visits}
                      </th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">
                        {t.reports.usage}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {r.por_aparelho.map((a) => (
                      <tr key={a.codigo + a.aparelho} className="bg-surface">
                        <td className="px-4 py-3 font-medium">
                          {a.codigo ? `${a.codigo} · ` : ""}
                          {a.aparelho}
                        </td>
                        <td className="px-4 py-3 text-muted">{a.loja}</td>
                        <td className="px-4 py-3">{a.visitas}</td>
                        <td className="px-4 py-3 text-muted">{tempo(a.segundos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="mt-8">
            <h2 className="text-sm font-medium text-muted">{t.reports.byFeature}</h2>
            <div className="mt-3 rounded-xl border border-line bg-surface p-5">
              <ul className="space-y-2">
                {r.por_recurso.map((x) => (
                  <li key={x.recurso} className="flex items-center gap-3">
                    <span className="w-44 shrink-0 truncate text-sm" title={x.recurso}>
                      {x.recurso}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className="block h-full rounded-full bg-brand-500"
                        style={{
                          width: `${Math.round((x.segundos / maiorRecurso) * 100)}%`,
                        }}
                      />
                    </span>
                    <span className="w-28 shrink-0 text-right text-xs text-muted">
                      {tempo(x.segundos)} · {x.sessoes}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-medium text-muted">{t.reports.byHour}</h2>
            <div className="mt-3 rounded-xl border border-line bg-surface p-5">
              <div className="flex items-end gap-1">
                {Array.from({ length: 15 }, (_, i) => i + 8).map((h) => {
                  const d = r.por_hora.find((x) => x.hora === h);
                  const altura = d
                    ? Math.max(8, Math.round((d.visitas / maiorHora) * 56))
                    : 2;
                  return (
                    <div key={h} className="flex flex-1 flex-col items-center gap-1">
                      {d && (
                        <span className="text-[10px] text-brand-500">{d.visitas}</span>
                      )}
                      <span
                        className={`w-4 rounded-sm ${d ? "bg-brand-500" : "bg-surface-2"}`}
                        style={{ height: `${altura}px` }}
                      />
                      <span className="text-[10px] text-muted">{h}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted">{t.reports.hourHint}</p>
            </div>
          </section>

          {r.aparelhos_sem_visita.length > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-medium text-muted">
                {t.reports.noVisits.replace(
                  "{n}",
                  String(r.aparelhos_sem_visita.length),
                )}
              </h2>
              <div className="mt-3 rounded-xl border border-warning/40 bg-warning/5 p-5">
                <p className="text-xs text-warning">{t.reports.noVisitsHint}</p>
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  {r.aparelhos_sem_visita.map((a) => (
                    <li key={`${a.codigo}-${a.aparelho}`}>
                      {a.codigo ? `${a.codigo} · ` : ""}
                      {a.aparelho} ({a.loja})
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
