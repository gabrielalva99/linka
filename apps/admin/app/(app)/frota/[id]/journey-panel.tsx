import { getMessages } from "@/lib/i18n";

/**
 * O que aconteceu com este aparelho na loja hoje.
 *
 * Existe para responder a pergunta que paga a operação: "o cliente parou aqui?
 * mexeu em quê?". O número que importa é a VISITA — a soma de segundos sozinha
 * não distingue uma pessoa curiosa por 5 minutos de vinte pessoas de 15s.
 */
export type Journey = {
  dia: string;
  fuso: string;
  abre: number;
  fecha: number;
  visitas: number;
  segundos_uso: number;
  segundos_vitrine: number;
  media_visitas: number | null;
  media_segundos_uso: number | null;
  dias_comparados: number;
  recursos: {
    recurso: string;
    categoria: string | null;
    sessoes: number;
    segundos: number;
  }[];
  horas: { hora: number; visitas: number; segundos: number }[];
};

/** "1min20" / "45s" / "2h10" — ninguém lê relatório de loja em segundos. */
function tempo(segundos: number): string {
  if (segundos < 60) return `${segundos}s`;
  if (segundos < 3600) {
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return s > 0 ? `${m}min${String(s).padStart(2, "0")}` : `${m}min`;
  }
  const h = Math.floor(segundos / 3600);
  const m = Math.round((segundos % 3600) / 60);
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/**
 * "+40% vs. média" — a comparação é com o próprio aparelho, nunca com outro.
 * Comparar duas lojas mede fluxo de rua, não desempenho da vitrine.
 */
function Comparacao({
  hoje,
  media,
  dias,
}: {
  hoje: number;
  media: number | null;
  dias: number;
}) {
  // Um dia só não é média. Dizer "+300%" contra uma única terça é ruído.
  if (media == null || media <= 0 || dias < 2) {
    return (
      <span className="text-xs text-muted">
        {dias === 0 ? "primeiro dia" : `${dias} dia(s) de histórico`}
      </span>
    );
  }
  const delta = Math.round(((hoje - media) / media) * 100);
  const cor =
    delta > 10 ? "text-success" : delta < -10 ? "text-warning" : "text-muted";
  return (
    <span className={`text-xs ${cor}`}>
      {delta > 0 ? "+" : ""}
      {delta}% vs. média de {dias}d ({media})
    </span>
  );
}

export function JourneyPanel({ journey }: { journey: Journey | null }) {
  const t = getMessages();
  const j = journey;
  const vazio = !j || j.visitas === 0;

  // A barra é proporcional ao maior valor do próprio dia, não a uma escala fixa:
  // um dia fraco continua legível em vez de virar uma fileira de traços.
  const maiorRecurso = Math.max(1, ...(j?.recursos ?? []).map((r) => r.segundos));
  const maiorHora = Math.max(1, ...(j?.horas ?? []).map((h) => h.visitas));

  // A faixa é o expediente DAQUELA loja, não um horário comercial inventado:
  // hora fora do expediente no gráfico sugere um buraco que não existe.
  const abre = j?.abre ?? 9;
  const fecha = j?.fecha ?? 22;
  const faixa = Array.from({ length: Math.max(1, fecha - abre) }, (_, i) => i + abre);
  const porHora = new Map((j?.horas ?? []).map((h) => [h.hora, h]));

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-muted">{t.device.journey}</h2>

      {vazio ? (
        <div className="mt-3 rounded-xl border border-line bg-surface p-5">
          <p className="text-sm text-muted">{t.device.journeyEmpty}</p>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-line bg-surface p-5">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted">{t.device.journeyVisits}</dt>
              <dd className="mt-1 text-2xl font-semibold text-brand-500">
                {j.visitas}
              </dd>
              <dd className="mt-0.5">
                <Comparacao
                  hoje={j.visitas}
                  media={j.media_visitas}
                  dias={j.dias_comparados}
                />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t.device.journeyTime}</dt>
              <dd className="mt-1 text-2xl font-semibold">
                {tempo(j.segundos_uso)}
              </dd>
              <dd className="mt-0.5 text-xs text-muted">
                {j.visitas > 0 &&
                  `${tempo(Math.round(j.segundos_uso / j.visitas))} por visita`}
              </dd>
            </div>
            {/* O denominador. Sem ele, "4 visitas" não vira taxa de parada — e
                é a taxa que diz se o ponto converte, não a contagem. */}
            <div>
              <dt className="text-xs text-muted">{t.device.journeyShowcase}</dt>
              <dd className="mt-1 text-2xl font-semibold">
                {j.segundos_vitrine > 0 ? tempo(j.segundos_vitrine) : "—"}
              </dd>
              {j.segundos_vitrine > 0 && (
                <dd className="mt-0.5 text-xs text-muted">
                  {t.device.journeyRate}{" "}
                  {(
                    (j.visitas / (j.segundos_vitrine / 3600)) || 0
                  ).toFixed(1)}
                  /h
                </dd>
              )}
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted">{t.device.journeyTop}</dt>
              <dd className="mt-1 truncate text-2xl font-semibold">
                {j.recursos[0]?.recurso ?? "—"}
              </dd>
            </div>
          </dl>

          <div className="mt-6 border-t border-line pt-5">
            <p className="text-xs text-muted">{t.device.journeyFeatures}</p>
            <ul className="mt-3 space-y-2">
              {j.recursos.map((r) => (
                <li key={r.recurso} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-sm">
                    {r.recurso}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full bg-brand-500"
                      style={{
                        width: `${Math.round((r.segundos / maiorRecurso) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="w-32 shrink-0 text-right text-xs text-muted">
                    {tempo(r.segundos)} · {r.sessoes} {t.device.journeySessions}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 border-t border-line pt-5">
            <p className="text-xs text-muted">{t.device.journeyHours}</p>
            <div className="mt-3 flex items-end gap-1">
              {faixa.map((h) => {
                const dado = porHora.get(h);
                const altura = dado
                  ? Math.max(8, Math.round((dado.visitas / maiorHora) * 56))
                  : 2;
                return (
                  <div key={h} className="flex flex-1 flex-col items-center gap-1">
                    {dado && (
                      <span className="text-[10px] text-brand-500">
                        {dado.visitas}
                      </span>
                    )}
                    <span
                      className={`w-4 rounded-sm ${dado ? "bg-brand-500" : "bg-surface-2"}`}
                      style={{ height: `${altura}px` }}
                      title={
                        dado
                          ? `${h}h — ${dado.visitas} visita(s), ${tempo(dado.segundos)}`
                          : `${h}h — sem movimento`
                      }
                    />
                    <span className="text-[10px] text-muted">{h}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="mt-4 text-xs text-muted">{t.device.journeyHint}</p>
        </div>
      )}
    </section>
  );
}
