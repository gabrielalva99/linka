/**
 * Data e hora com fuso SEMPRE declarado.
 *
 * O DEFEITO QUE ISTO CONSERTA. Oito lugares do painel formatavam data com
 * `toLocaleString("pt-BR")` e nenhum dizia em que fuso. Isso funciona no
 * navegador — pega o relógio de quem olha — e mente no servidor, que é onde estas
 * telas realmente renderizam: a Vercel roda em UTC. Toda hora do painel estava
 * três horas adiantada, silenciosamente. O Gabriel viu "22:36" num destrave que
 * aconteceu às 19:36.
 *
 * O pior caso era o relógio de frescor do relatório ("medições recebidas até
 * HH:MM"). Ele existe para o relatório não mentir por omissão — e era ele que
 * mentia mais, porque ninguém desconfia de um horário.
 *
 * A REGRA: hora de fato acontecido é a hora DA LOJA. Uma visita às 20h em Manaus
 * aconteceu às 20h para quem estava lá; convertê-la para São Paulo inventa um
 * horário que ninguém viveu, e o relatório por hora deixa de bater com o
 * movimento real. Por isso `fuso` é parâmetro, e não constante.
 *
 * Sem loja conhecida cai em São Paulo, que é onde a operação está hoje. Uma
 * constante só, num lugar só: quando entrar a primeira loja fora do Brasil, o
 * conserto é passar o fuso dela aqui, e não caçar oito `toLocaleString`.
 */
export const FUSO_PADRAO = "America/Sao_Paulo";

type Entrada = string | Date | null | undefined;

function paraData(v: Entrada): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "29/07 19:36" — o formato do dia a dia da operação. */
export function dataHora(v: Entrada, fuso: string = FUSO_PADRAO): string {
  const d = paraData(v);
  if (!d) return "—";
  return d.toLocaleString("pt-BR", {
    timeZone: fuso,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "29/07/2026" — para o que é registro, não operação. */
export function data(v: Entrada, fuso: string = FUSO_PADRAO): string {
  const d = paraData(v);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: fuso });
}

/** "29/07" — eixo de gráfico, onde o ano é ruído. */
export function diaMes(v: Entrada, fuso: string = FUSO_PADRAO): string {
  const d = paraData(v);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR", {
    timeZone: fuso,
    day: "2-digit",
    month: "2-digit",
  });
}

/** "19:36" — o relógio de frescor do relatório. */
export function hora(v: Entrada, fuso: string = FUSO_PADRAO): string {
  const d = paraData(v);
  if (!d) return "—";
  return d.toLocaleTimeString("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * O nome da loja como ela se identifica: rede e local juntos.
 *
 * "Shopping Interlagos" não é a loja — é o shopping onde a loja está. E o nome
 * do local sozinho nem identifica: há TRÊS lojas chamadas "Shopping Interlagos"
 * no cadastro, de redes diferentes (Casas Bahia, Ponto Frio, Americanas).
 *
 * Fica aqui, e não repetido em cada tela, porque este texto também é o que o
 * relatório usa para FILTRAR: se as duas pontas escreverem a identidade de
 * formas diferentes, o filtro deixa de casar e ninguém entende por quê.
 *
 * Aceita o formato que o Supabase devolve para relação — objeto ou lista.
 */
export function nomeDaLoja(
  loja:
    | {
        name?: string | null;
        retail_chains?: { name?: string | null } | { name?: string | null }[] | null;
      }
    | null
    | undefined,
): string | null {
  if (!loja?.name) return null;
  const rel = Array.isArray(loja.retail_chains) ? loja.retail_chains[0] : loja.retail_chains;
  const rede = rel?.name?.trim();
  // Rede com o mesmo nome do local viraria "X - X": mostra uma vez só.
  if (!rede || rede === loja.name.trim()) return loja.name;
  return `${rede} - ${loja.name}`;
}
