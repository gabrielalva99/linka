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

  // ACIDENTES, E NÃO REGISTROS.
  //
  // Quando a memória acaba, tudo que tentar alocar naquele segundo quebra junto:
  // um acidente vira meia dúzia de registros, cada um com uma pilha diferente.
  // A tela contava registros e dizia "9 vezes" para o que foram DOIS acidentes,
  // com quase seis horas de vitrine no ar entre eles. Quem lê conclui que o
  // aparelho está caindo sem parar, e a conclusão é falsa.
  //
  // Dois minutos separa um acidente do seguinte. É folgado de propósito: os
  // registros de um mesmo estouro chegam no mesmo segundo, e ninguém quebra duas
  // vezes de verdade em dois minutos sem que isso seja, na prática, o mesmo
  // problema.
  const JANELA_DO_ACIDENTE_MS = 120_000;

  type Acidente = { quando: string; versao: string | null; registros: number };
  const porDefeito = new Map<
    string,
    { amostra: Queda; acidentes: Acidente[]; registros: number }
  >();

  for (const q of [...quedas].sort((a, b) => a.ocorreu_em.localeCompare(b.ocorreu_em))) {
    const atual = porDefeito.get(q.fingerprint);
    if (!atual) {
      porDefeito.set(q.fingerprint, {
        amostra: q,
        acidentes: [{ quando: q.ocorreu_em, versao: q.agent_version, registros: 1 }],
        registros: 1,
      });
      continue;
    }
    atual.registros += 1;
    // A amostra fica sendo a mais recente: é a que descreve o estado de agora.
    atual.amostra = q;
    const ultimo = atual.acidentes[atual.acidentes.length - 1];
    const distancia =
      new Date(q.ocorreu_em).getTime() - new Date(ultimo.quando).getTime();
    if (distancia <= JANELA_DO_ACIDENTE_MS) {
      ultimo.registros += 1;
    } else {
      // A VERSÃO ACOMPANHA CADA ACIDENTE, e isto não é detalhe.
      //
      // A tela mostrava a versão do registro mais recente para o grupo inteiro:
      // uma queda na 0.107.0 e outra na 0.108.0 apareciam as duas como 0.108.0,
      // fazendo a versão nova responder por um defeito que não foi dela. Numa
      // decisao de publicar, isso e a diferenca entre voltar atras e seguir.
      atual.acidentes.push({
        quando: q.ocorreu_em,
        versao: q.agent_version,
        registros: 1,
      });
    }
  }

  return (
    <section className="rounded-xl border border-danger/40 bg-danger/5 p-5">
      <h2 className="text-sm font-semibold text-danger">{t.crash.title}</h2>
      <p className="mt-1 text-xs text-muted">{t.crash.hint}</p>

      <ul className="mt-4 flex flex-col gap-3">
        {[...porDefeito.values()].map(({ amostra, acidentes, registros }) => (
          <li key={amostra.fingerprint} className="rounded-lg bg-surface p-3">
            <p className="text-sm font-medium">
              {amostra.tipo.split(".").pop()}
              {acidentes.length > 1 && (
                <span className="ml-2 text-xs font-normal text-danger">
                  {t.crash.incidents.replace("{n}", String(acidentes.length))}
                </span>
              )}
              {registros > acidentes.length && (
                <span className="ml-2 text-xs font-normal text-muted">
                  {t.crash.records.replace("{n}", String(registros))}
                </span>
              )}
            </p>
            {amostra.mensagem && (
              <p className="mt-1 break-words text-xs text-muted">{amostra.mensagem}</p>
            )}
            <p className="mt-1 text-xs text-muted">
              {acidentes
                .slice(-4)
                .map(
                  (a) =>
                    dataHora(a.quando, fuso) + (a.versao ? ` (${a.versao})` : ""),
                )
                .join(" · ")}
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
