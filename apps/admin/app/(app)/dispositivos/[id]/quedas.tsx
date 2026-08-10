import { dataHora } from "@/lib/datas";
import { getMessages } from "@/lib/i18n";

export type Queda = {
  fingerprint: string;
  tipo: string;
  mensagem: string | null;
  pilha: string | null;
  agent_version: string | null;
  ocorreu_em: string;
};

/**
 * Quando o aplicativo caiu, e por quê.
 *
 * ANTES DISTO, app que travava numa loja era invisível: o painel dizia "fora do
 * ar" e ninguém sabia se era energia, rede, aparelho recolhido ou defeito nosso.
 * Com 250 aparelhos, a diferença entre essas hipóteses é uma viagem — e foi
 * adivinhando por consulta ao banco que passamos a noite de 09/08.
 *
 * AGRUPA POR DEFEITO, e não lista ocorrência por ocorrência. Vinte linhas iguais
 * não dizem mais que uma; o que informa é "este mesmo erro, 20 vezes, desde
 * ontem". Ocorrência solta some no meio do próprio ruído.
 *
 * A pilha fica escondida atrás de um clique. Ela é para quem vai consertar; para
 * quem opera a loja, o que importa é que caiu, quantas vezes e desde quando.
 */
export function Quedas({ quedas, fuso }: { quedas: Queda[]; fuso: string }) {
  const t = getMessages();
  if (quedas.length === 0) return null;

  // Agrupa preservando a ordem de chegada (a consulta já vem da mais recente).
  const porDefeito = new Map<string, { amostra: Queda; vezes: number; primeira: string }>();
  for (const q of quedas) {
    const atual = porDefeito.get(q.fingerprint);
    if (atual) {
      atual.vezes += 1;
      if (q.ocorreu_em < atual.primeira) atual.primeira = q.ocorreu_em;
    } else {
      porDefeito.set(q.fingerprint, { amostra: q, vezes: 1, primeira: q.ocorreu_em });
    }
  }

  return (
    <section className="rounded-xl border border-danger/40 bg-danger/5 p-5">
      <h2 className="text-sm font-semibold text-danger">{t.crash.title}</h2>
      <p className="mt-1 text-xs text-muted">{t.crash.hint}</p>

      <ul className="mt-4 flex flex-col gap-3">
        {[...porDefeito.values()].map(({ amostra, vezes, primeira }) => (
          <li key={amostra.fingerprint} className="rounded-lg bg-surface p-3">
            <p className="text-sm font-medium">
              {amostra.tipo.split(".").pop()}
              {vezes > 1 && (
                <span className="ml-2 text-xs font-normal text-danger">
                  {t.crash.times.replace("{n}", String(vezes))}
                </span>
              )}
            </p>
            {amostra.mensagem && (
              <p className="mt-1 break-words text-xs text-muted">{amostra.mensagem}</p>
            )}
            <p className="mt-1 text-xs text-muted">
              {vezes > 1
                ? t.crash.since
                    .replace("{p}", dataHora(primeira, fuso))
                    .replace("{u}", dataHora(amostra.ocorreu_em, fuso))
                : dataHora(amostra.ocorreu_em, fuso)}
              {amostra.agent_version ? ` · ${amostra.agent_version}` : ""}
            </p>

            {amostra.pilha && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
                  {t.crash.details}
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-surface-2 p-2 font-mono text-[11px] leading-relaxed text-muted">
                  {amostra.pilha}
                </pre>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
