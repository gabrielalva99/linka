import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { podeOperarAgora } from "@/lib/perms";
import { porCliente, tenantFilter } from "@/lib/tenant";
import { ReportFilters } from "./report-filters";

type Proibido = {
  loja: string;
  aparelho: string;
  codigo: string | null;
  app: string;
  vezes: number;
  ultima_vez: string;
  sai_em: string;
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
  frota: {
    aparelhos: number;
    lojas_com_aparelho: number;
    lojas_total: number;
    modelos: number;
    sem_loja: number;
  };
  cobertura: { linha: string; lojas_com: number; lojas_total: number }[];
  por_modelo: {
    modelo: string;
    linha: string;
    unidades: number;
    lojas: number;
    visitas: number;
    segundos: number;
    segundos_vitrine: number;
    ultimo_dia: number | null;
    ultimo_dia_data: string | null;
    media_dia: number | null;
    dias_base: number;
  }[];
  perfil_hora: { linha: string; hora: number; visitas: number }[];
  por_recurso_modelo: {
    modelo: string;
    recurso: string;
    sessoes: number;
    segundos: number;
  }[];
  por_regiao: {
    uf: string;
    cidade: string;
    tipo_local: string;
    linha: string;
    visitas: number;
    segundos: number;
  }[];
  por_conteudo: {
    midia: string;
    segundos_no_ar: number;
    visitas: number;
    segundos_uso: number;
  }[];
  anterior: {
    visitas: number;
    segundos_uso: number;
    segundos_vitrine: number;
    tem_base: boolean;
  };
  por_dia_semana: {
    dia: number;
    visitas: number;
    segundos: number;
    dias: number;
  }[];
  mapa: { dia: number; hora: number; visitas: number }[];
  por_canal_hora: { tipo_local: string; hora: number; visitas: number }[];
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

/**
 * Variação contra o período anterior.
 *
 * Devolve null quando não havia base: crescer 100% em cima de zero é uma frase
 * sem significado, e o painel prefere não dizer nada a dizer isso.
 */
function variacao(agora: number, antes: number) {
  if (antes <= 0) return null;
  const pct = Math.round(((agora - antes) / antes) * 100);
  // Zero não é alta. Pintar "0%" de verde sugere melhora onde houve estabilidade,
  // que é o tipo de mentira pequena que corrói a confiança no resto da tela.
  return {
    texto: `${pct > 0 ? "+" : ""}${pct}%`,
    tom: pct === 0 ? "igual" : pct > 0 ? "subiu" : "caiu",
  } as const;
}

const DIAS_SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

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
  const podeOperar = await podeOperarAgora();

  const supabase = await createSupabaseServerClient();
  // O recorte de cliente vai junto: para quem opera a plataforma o RLS entrega
  // todos os clientes, e um relatório somando duas marcas parece apenas um
  // relatório com números maiores.
  const filtro = await tenantFilter();
  const { data, error } = await supabase.rpc("fleet_report", {
    p_days: periodo,
    p_rede: rede || null,
    p_loja: loja || null,
    p_aparelho: aparelho || null,
    p_tenant: filtro,
  });

  // As opções dos filtros vêm do cadastro, não do resultado: uma loja que ficou
  // sem movimento no período tem que continuar selecionável, senão a pessoa não
  // consegue perguntar justamente sobre a loja que parou.
  // Até quando o dado chegou.
  //
  // Sem isto o relatório mente por omissão: o aparelho manda o que mediu a cada
  // minuto, e uma sessão de uso só fecha quando a pessoa sai do app — então uma
  // visita aparece de um a três minutos depois de acontecer. Quem pega o
  // aparelho e recarrega a tela vê o número antigo e conclui que está quebrado.
  // Foi exatamente o que aconteceu no primeiro teste de campo.
  const { data: ultimo } = await porCliente(
    supabase.from("device_events").select("created_at"),
    filtro,
  )
    .order("created_at", { ascending: false })
    .limit(1);

  const [{ data: redesData }, { data: lojasData }, { data: aparelhosData }] =
    await Promise.all([
      porCliente(supabase.from("retail_chains").select("name"), filtro).order("name"),
      porCliente(supabase.from("stores").select("name"), filtro).order("name"),
      porCliente(supabase.from("devices").select("code, name"), filtro)
        .eq("exclude_from_reports", false)
        .order("code"),
    ]);
  const r = data as Report | null;

  if (error || !r) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="text-xl font-semibold">{t.reports.title}</h1>
        <p className="mt-6 rounded-xl border border-warning/40 bg-warning/10 p-5 text-sm text-warning">
          {t.reports.readFailed}
        </p>
      </div>
    );
  }

  const semDado = r.visitas === 0;

  // Período escrito por extenso. Um print de relatório sem data não serve de
  // nada dali a duas semanas.
  const fim = new Date();
  const inicio = new Date();
  inicio.setDate(fim.getDate() - (periodo - 1));
  const dia = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const periodoTexto = `${dia(inicio)} a ${dia(fim)}`;
  const recebidoAte = ultimo?.[0]?.created_at
    ? new Date(ultimo[0].created_at as string).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  /** "1 aparelho" e não "1 aparelho(s)". Relatório de cliente não tem parêntese. */
  const plural = (n: number, um: string, muitos: string) =>
    `${n} ${n === 1 ? um : muitos}`;
  const maiorHora = Math.max(1, ...r.por_hora.map((h) => h.visitas));
  const maiorRecurso = Math.max(1, ...r.por_recurso.map((x) => x.segundos));
  const modelosComUso = new Set(
    (r.por_recurso_modelo ?? []).map((x) => x.modelo),
  ).size;
  const filtroUrl =
    (rede ? `&rede=${encodeURIComponent(rede)}` : "") +
    (loja ? `&loja=${encodeURIComponent(loja)}` : "") +
    (aparelho ? `&aparelho=${encodeURIComponent(aparelho)}` : "");

  /** Variação só aparece quando havia base. Sem base, nada. */
  const Variacao = ({ agora, antes }: { agora: number; antes: number }) => {
    if (!r.anterior?.tem_base) return null;
    const v = variacao(agora, antes);
    if (!v) return null;
    return (
      <dd className={`mt-0.5 text-xs ${v.tom === "igual" ? "text-muted" : v.tom === "subiu" ? "text-success" : "text-warning"}`}>
        {v.texto} <span className="text-muted">{t.reports.vsPrevious}</span>
      </dd>
    );
  };

  // Horas visíveis nos gráficos: o expediente padrão, não as 24 do dia. Meia
  // dúzia de colunas vazias de madrugada só empurram o que importa para o canto.
  const HORAS = Array.from({ length: 15 }, (_, i) => i + 8);
  const semana = DIAS_SEMANA.map((nome, i) => {
    const d = (r.por_dia_semana ?? []).find((x) => x.dia === i + 1);
    return {
      nome,
      media: d && d.dias > 0 ? d.visitas / d.dias : 0,
      visitas: d?.visitas ?? 0,
    };
  });
  const maiorMedia = Math.max(0.01, ...semana.map((s) => s.media));
  const maiorCelula = Math.max(1, ...(r.mapa ?? []).map((c) => c.visitas));
  const canais = [...new Set((r.por_canal_hora ?? []).map((c) => c.tipo_local))];
  const maiorCanal = Math.max(1, ...(r.por_canal_hora ?? []).map((c) => c.visitas));

  // Modelos com pelo menos um outro dia completo para servir de base. Sem isso
  // a seção seria uma tabela de traços.
  const comparaveis = (r.por_modelo ?? []).filter(
    (m) => m.dias_base > 0 && m.ultimo_dia != null && m.media_dia != null,
  );

  /**
   * Perfil horário: a fatia das visitas de cada linha em cada hora, contra a
   * mesma fatia na operação inteira.
   *
   * Em fatia e não em contagem de propósito — a linha com mais aparelhos na rua
   * ganharia todas as horas, e a pergunta aqui não é volume, é HORÁRIO.
   */
  const totalGeralHora = (r.por_hora ?? []).reduce((s, h) => s + h.visitas, 0);
  const linhas = [...new Set((r.perfil_hora ?? []).map((x) => x.linha))];
  const perfis = linhas.map((linha) => {
    const dela = (r.perfil_hora ?? []).filter((x) => x.linha === linha);
    const total = dela.reduce((s, x) => s + x.visitas, 0) || 1;
    return {
      linha,
      horas: HORAS.map((h) => ({
        hora: h,
        linhaPct: (dela.find((x) => x.hora === h)?.visitas ?? 0) / total,
        geralPct:
          totalGeralHora > 0
            ? (r.por_hora.find((x) => x.hora === h)?.visitas ?? 0) / totalGeralHora
            : 0,
      })),
    };
  });
  const maiorPct = Math.max(
    0.01,
    ...perfis.flatMap((p) => p.horas.flatMap((h) => [h.linhaPct, h.geralPct])),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t.reports.title}</h1>
          <p className="mt-0.5 text-xs text-muted">
            {periodoTexto}
            {recebidoAte && ` · ${t.reports.receivedUntil.replace("{h}", recebidoAte)}`}
          </p>
        </div>
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
          {/* Um botão só aqui em cima. O download de vídeos vive dentro da
              seção de vídeos: dois botões iguais lado a lado eram eu empurrando
              para quem lê uma decisão que é minha — as duas planilhas têm grãos
              diferentes (recurso × vídeo) e não podem virar um arquivo só, mas
              isso não é problema de quem clica. */}
          <a
            href={`/relatorios/exportar?dias=${periodo}${filtroUrl}`}
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
      {podeOperar && r.aparelhos_fora > 0 && (
        <p className="mt-3 text-xs text-muted">
          {t.reports.excluded.replace(
            "{n}",
            plural(r.aparelhos_fora, "aparelho marcado", "aparelhos marcados"),
          )}
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
                    {plural(a.vezes, "vez", "vezes")}
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
                  plural(r.proibidos_corrigidos.length, "caso", "casos"),
                )}
              </summary>
              <p className="mt-2 text-xs text-muted">{t.reports.blockedFixedHint}</p>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-muted">
                {r.proibidos_corrigidos.map((a) => (
                  <li key={`${a.codigo}-${a.app}`}>
                    {`${a.app} · ${a.codigo ? `${a.codigo} · ` : ""}${a.aparelho} · ${a.loja} · `}
                    {plural(a.vezes, "vez", "vezes")}
                    {` · ${t.reports.lastTime} ${a.ultima_vez} · `}
                    {t.reports.leavesOn.replace("{d}", a.sai_em)}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-line bg-surface p-5">
              <dt className="text-xs text-muted">{t.reports.visits}</dt>
              <dd className="mt-1 text-2xl font-semibold text-brand-500">{r.visitas}</dd>
              <Variacao agora={r.visitas} antes={r.anterior?.visitas ?? 0} />
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
              <Variacao
                agora={r.segundos_uso}
                antes={r.anterior?.segundos_uso ?? 0}
              />
            </div>
            <div className="rounded-xl border border-line bg-surface p-5">
              <dt className="text-xs text-muted">{t.reports.showcase}</dt>
              <dd className="mt-1 text-2xl font-semibold">{tempo(r.segundos_vitrine)}</dd>
              <Variacao
                agora={r.segundos_vitrine}
                antes={r.anterior?.segundos_vitrine ?? 0}
              />
            </div>
            <div className="rounded-xl border border-line bg-surface p-5">
              <dt className="text-xs text-muted">{t.reports.rate}</dt>
              <dd className="mt-1 text-2xl font-semibold">
                {taxa(r.visitas, r.segundos_vitrine)}
                <span className="text-base font-normal text-muted">/h</span>
              </dd>
            </div>
          </dl>

          {!r.anterior?.tem_base && (
            <p className="mt-2 text-xs text-muted">{t.reports.noBaseline}</p>
          )}

          {/* Tamanho da operação, em uma linha. Sai da frota e não do movimento:
              é o denominador de tudo que vem abaixo, e loja sem interação
              continua sendo loja. */}
          {r.frota && (
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span>{plural(r.frota.aparelhos, "aparelho ativo", "aparelhos ativos")}</span>
              <span>·</span>
              <span>
                {t.reports.storesWith
                  .replace("{n}", String(r.frota.lojas_com_aparelho))
                  .replace("{t}", String(r.frota.lojas_total))}
              </span>
              <span>·</span>
              <span>{plural(r.frota.modelos, "modelo", "modelos")}</span>
              {r.frota.sem_loja > 0 && (
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-warning">
                  {t.reports.withoutStore.replace("{n}", String(r.frota.sem_loja))}
                </span>
              )}
            </p>
          )}

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

          {/* Engajamento por rede. Com uma rede só, repete o total. */}
          {(r.por_rede?.length ?? 0) > 1 && (
            <section className="mt-8">
              <h2 className="text-sm font-medium text-muted">{t.reports.byChain}</h2>
              <div className="mt-3 overflow-hidden rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-left text-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">{t.reports.chain}</th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">
                        {t.reports.visits}
                      </th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">
                        {t.reports.usage}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {r.por_rede.map((c) => (
                      <tr key={c.rede} className="bg-surface">
                        <td className="px-4 py-3 font-medium">{c.rede}</td>
                        <td className="px-4 py-3">{c.visitas}</td>
                        <td className="px-4 py-3 text-muted">{tempo(c.segundos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* O corte de venda. Vem antes do corte por aparelho de propósito:
              "aparelho 109" é inventário, "Razr" é decisão.

              Unidades e lojas entram na MESMA tabela porque é a comparação que
              não pode ser separada: "o Moto G lidera" costuma ser só "o Moto G
              está em 40 lojas e o Razr em 6". Quem responde isso é a coluna
              "por aparelho". */}
          {(r.por_modelo?.length ?? 0) > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-medium text-muted">{t.reports.byModel}</h2>
              <div className="mt-3 overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="bg-surface-2 text-left text-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">{t.reports.model}</th>
                      <th className="px-4 py-2 font-medium">{t.reports.line}</th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">
                        {t.reports.units}
                      </th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">
                        {t.reports.presence}
                      </th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">
                        {t.reports.visits}
                      </th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">
                        {t.reports.perUnit}
                      </th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">
                        {t.reports.rate}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {r.por_modelo.map((m) => (
                      <tr key={`${m.modelo}-${m.linha}`} className="bg-surface">
                        <td className="px-4 py-3 font-medium">{m.modelo}</td>
                        <td className="px-4 py-3 text-muted">{m.linha}</td>
                        <td className="px-4 py-3 text-muted">{m.unidades}</td>
                        <td className="px-4 py-3 text-muted">{m.lojas}</td>
                        <td className="px-4 py-3">{m.visitas}</td>
                        <td className="px-4 py-3 font-medium text-brand-500">
                          {m.unidades > 0 ? (m.visitas / m.unidades).toFixed(1) : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {taxa(m.visitas, m.segundos_vitrine)}/h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted">{t.reports.modelHint}</p>
            </section>
          )}

          {comparaveis.length > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-medium text-muted">{t.reports.lastDay}</h2>
              <div className="mt-3 overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-surface-2 text-left text-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">{t.reports.model}</th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">
                        {t.reports.lastDayColumn}
                      </th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">
                        {t.reports.average}
                      </th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">
                        {t.reports.change}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {comparaveis.map((m) => {
                      const v = variacao(m.ultimo_dia!, m.media_dia!);
                      return (
                        <tr key={m.modelo} className="bg-surface">
                          <td className="px-4 py-3 font-medium">{m.modelo}</td>
                          <td className="px-4 py-3">
                            {m.ultimo_dia}
                            <span className="ml-2 text-xs text-muted">
                              {m.ultimo_dia_data}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted">
                            {m.media_dia}
                            <span className="ml-2 text-xs text-muted">
                              {plural(m.dias_base, "dia", "dias")}
                            </span>
                          </td>
                          <td
                            className={`px-4 py-3 font-medium ${
                              v && v.tom !== "igual"
                                ? v.tom === "subiu"
                                  ? "text-success"
                                  : "text-warning"
                                : "text-muted"
                            }`}
                          >
                            {v?.texto ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted">{t.reports.lastDayHint}</p>
            </section>
          )}

          {/* Cobertura: quantas lojas do recorte têm cada linha. Sai da frota,
              não do movimento — linha instalada e nunca tocada continua
              instalada, e é isso que a marca precisa enxergar. */}
          {(r.cobertura?.length ?? 0) > 0 && r.frota?.lojas_total > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-medium text-muted">{t.reports.coverage}</h2>
              <div className="mt-3 rounded-xl border border-line bg-surface p-5">
                <ul className="space-y-2">
                  {r.cobertura.map((c) => (
                    <li key={c.linha} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 truncate text-sm">{c.linha}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <span
                          className="block h-full rounded-full bg-brand-500"
                          style={{
                            width: `${Math.round((c.lojas_com / Math.max(1, c.lojas_total)) * 100)}%`,
                          }}
                        />
                      </span>
                      <span className="w-32 shrink-0 text-right text-xs text-muted">
                        {c.lojas_com} de {c.lojas_total}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted">{t.reports.coverageHint}</p>
              </div>
            </section>
          )}

          {/* Só faz sentido com mais de uma praça: com uma linha só, a tabela
              repete o total e ocupa espaço sem dizer nada. */}
          {(r.por_regiao?.length ?? 0) > 1 && (
            <section className="mt-8">
              <h2 className="text-sm font-medium text-muted">{t.reports.byRegion}</h2>
              <div className="mt-3 overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-surface-2 text-left text-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">{t.reports.city}</th>
                      <th className="px-4 py-2 font-medium">{t.reports.placeKind}</th>
                      <th className="px-4 py-2 font-medium">{t.reports.line}</th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">
                        {t.reports.visits}
                      </th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">
                        {t.reports.usage}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {r.por_regiao.map((g) => (
                      <tr
                        key={`${g.uf}-${g.cidade}-${g.tipo_local}-${g.linha}`}
                        className="bg-surface"
                      >
                        <td className="px-4 py-3 font-medium">
                          {g.cidade}
                          <span className="ml-1 text-xs text-muted">{g.uf}</span>
                        </td>
                        <td className="px-4 py-3 text-muted">{g.tipo_local}</td>
                        <td className="px-4 py-3 text-muted">{g.linha}</td>
                        <td className="px-4 py-3">{g.visitas}</td>
                        <td className="px-4 py-3 text-muted">{tempo(g.segundos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted">{t.reports.regionHint}</p>
            </section>
          )}

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

          {/* O cruzamento só diz algo com mais de um modelo. Com um só, ele
              repete a lista de cima com uma coluna a mais. */}
          {modelosComUso > 1 && (
            <section className="mt-8">
              <h2 className="text-sm font-medium text-muted">
                {t.reports.byFeatureModel}
              </h2>
              <div className="mt-3 overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="bg-surface-2 text-left text-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">{t.reports.model}</th>
                      <th className="px-4 py-2 font-medium">{t.reports.byFeature}</th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">
                        {t.reports.usage}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {r.por_recurso_modelo.map((x) => (
                      <tr key={`${x.modelo}-${x.recurso}`} className="bg-surface">
                        <td className="px-4 py-3 font-medium">{x.modelo}</td>
                        <td className="px-4 py-3 text-muted">{x.recurso}</td>
                        <td className="px-4 py-3 text-muted">
                          {tempo(x.segundos)} · {x.sessoes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-muted">{t.reports.byContent}</h2>
              {(r.por_conteudo?.length ?? 0) > 0 && (
                <a
                  href={`/relatorios/exportar?tipo=conteudo&dias=${periodo}${filtroUrl}`}
                  className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-surface-2"
                >
                  {t.reports.exportContent}
                </a>
              )}
            </div>
            <div className="mt-3 overflow-x-auto rounded-xl border border-line">
              {(r.por_conteudo?.length ?? 0) > 0 ? (
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="bg-surface-2 text-left text-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">{t.reports.media}</th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">
                        {t.reports.onAir}
                      </th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">
                        {t.reports.visits}
                      </th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">
                        {t.reports.rate}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {r.por_conteudo.map((c) => (
                      <tr key={c.midia} className="bg-surface">
                        <td className="px-4 py-3 font-medium">{c.midia}</td>
                        <td className="px-4 py-3 text-muted">
                          {tempo(c.segundos_no_ar)}
                        </td>
                        <td className="px-4 py-3">{c.visitas}</td>
                        <td className="px-4 py-3 text-muted">
                          {taxa(c.visitas, c.segundos_no_ar)}/h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="bg-surface px-4 py-6 text-sm text-muted">
                  {t.reports.contentEmpty}
                </p>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">{t.reports.contentHint}</p>
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
                        <span className="text-xs text-brand-500">{d.visitas}</span>
                      )}
                      <span
                        className={`w-4 rounded-sm ${d ? "bg-brand-500" : "bg-surface-2"}`}
                        style={{ height: `${altura}px` }}
                      />
                      <span className="text-xs text-muted">{h}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted">{t.reports.hourHint}</p>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-medium text-muted">{t.reports.byWeekday}</h2>
            <div className="mt-3 rounded-xl border border-line bg-surface p-5">
              <div className="flex items-end gap-2">
                {semana.map((s) => (
                  <div key={s.nome} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-xs text-brand-500">
                      {s.media > 0 ? s.media.toFixed(1) : ""}
                    </span>
                    {/* Largura fixa, como no gráfico por hora. Barra que estica
                        com o container vira bloco e some a leitura de altura. */}
                    <span
                      className={`w-6 rounded-sm ${s.media > 0 ? "bg-brand-500" : "bg-surface-2"}`}
                      style={{
                        height: `${s.media > 0 ? Math.max(8, Math.round((s.media / maiorMedia) * 56)) : 2}px`,
                      }}
                    />
                    <span className="text-xs text-muted">{s.nome}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">{t.reports.weekdayHint}</p>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-medium text-muted">{t.reports.heatmap}</h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface p-5">
              <div className="min-w-[420px]">
                {DIAS_SEMANA.map((nome, i) => (
                  <div key={nome} className="flex items-center gap-1">
                    <span className="w-8 shrink-0 text-xs text-muted">{nome}</span>
                    {HORAS.map((h) => {
                      const c = (r.mapa ?? []).find(
                        (x) => x.dia === i + 1 && x.hora === h,
                      );
                      return (
                        <span
                          key={h}
                          title={`${nome} ${h}h · ${c?.visitas ?? 0}`}
                          className={`h-5 flex-1 rounded-sm ${c ? "bg-brand-500" : "bg-surface-2"}`}
                          // Intensidade proporcional, com piso: uma célula com
                          // uma visita só não pode ficar invisível.
                          style={
                            c
                              ? { opacity: 0.25 + (c.visitas / maiorCelula) * 0.75 }
                              : undefined
                          }
                        />
                      );
                    })}
                  </div>
                ))}
                <div className="mt-1 flex items-center gap-1">
                  <span className="w-8 shrink-0" />
                  {HORAS.map((h) => (
                    <span key={h} className="flex-1 text-center text-xs text-muted">
                      {h}
                    </span>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-xs text-muted">{t.reports.heatmapHint}</p>
            </div>
          </section>

          {/* Só com os dois canais na base. Com um só, são duas linhas dizendo
              a mesma coisa que o gráfico de cima. */}
          {canais.length > 1 && (
            <section className="mt-8">
              <h2 className="text-sm font-medium text-muted">{t.reports.byChannel}</h2>
              <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface p-5">
                <div className="min-w-[420px] space-y-3">
                  {canais.map((canal) => (
                    <div key={canal}>
                      <p className="text-xs text-muted">{canal}</p>
                      <div className="mt-1 flex items-end gap-1">
                        {HORAS.map((h) => {
                          const c = (r.por_canal_hora ?? []).find(
                            (x) => x.tipo_local === canal && x.hora === h,
                          );
                          return (
                            <span
                              key={h}
                              title={`${canal} ${h}h · ${c?.visitas ?? 0}`}
                              className={`flex-1 rounded-sm ${c ? "bg-brand-500" : "bg-surface-2"}`}
                              style={{
                                height: `${c ? Math.max(6, Math.round((c.visitas / maiorCanal) * 40)) : 2}px`,
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-1">
                    {HORAS.map((h) => (
                      <span key={h} className="flex-1 text-center text-xs text-muted">
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted">{t.reports.channelHint}</p>
              </div>
            </section>
          )}

          {/* Perfil horário por linha. Com uma linha só, a barra e o traço
              coincidem em todas as horas — desenho bonito dizendo nada. */}
          {linhas.length > 1 && (
            <section className="mt-8">
              <h2 className="text-sm font-medium text-muted">{t.reports.profile}</h2>
              <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface p-5">
                <div className="min-w-[420px] space-y-4">
                  {perfis.map((p) => (
                    <div key={p.linha}>
                      <p className="text-xs text-muted">{p.linha}</p>
                      <div className="mt-1 flex items-end gap-1">
                        {p.horas.map((h) => (
                          <span
                            key={h.hora}
                            title={`${p.linha} ${h.hora}h · ${Math.round(h.linhaPct * 100)}% (operação ${Math.round(h.geralPct * 100)}%)`}
                            className="relative flex-1"
                            style={{ height: "44px" }}
                          >
                            <span
                              className="absolute bottom-0 left-0 w-full rounded-sm bg-brand-500"
                              style={{ height: `${(h.linhaPct / maiorPct) * 44}px` }}
                            />
                            {/* A operação inteira, para comparar sem sair da linha. */}
                            <span
                              className="absolute left-0 h-px w-full bg-muted"
                              style={{ bottom: `${(h.geralPct / maiorPct) * 44}px` }}
                            />
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-1">
                    {HORAS.map((h) => (
                      <span key={h} className="flex-1 text-center text-xs text-muted">
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted">{t.reports.profileHint}</p>
              </div>
            </section>
          )}

          {r.aparelhos_sem_visita.length > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-medium text-muted">
                {t.reports.noVisits.replace(
                  "{n}",
                  plural(r.aparelhos_sem_visita.length, "aparelho", "aparelhos"),
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
