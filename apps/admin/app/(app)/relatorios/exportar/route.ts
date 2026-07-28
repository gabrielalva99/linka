import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * A saída dos dados. O BI da ProSolution é o cliente número 1 do que a gente
 * coleta, e até agora o dado só saía por consulta manual no banco.
 *
 * CSV com ponto e vírgula e BOM porque o destino real é o Excel em português:
 * vírgula como separador quebra em máquina com locale pt-BR, e sem o BOM os
 * acentos viram símbolo. Detalhe bobo que decide se a planilha abre ou não.
 *
 * Uma linha por aparelho, por hora, por recurso. É o mesmo grão que o BI já
 * consome hoje, para ninguém ter que reaprender a planilha.
 */
function csv(linhas: Record<string, unknown>[]): string {
  if (linhas.length === 0) return "﻿";
  const colunas = Object.keys(linhas[0]);
  const escapa = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const corpo = linhas.map((l) => colunas.map((c) => escapa(l[c])).join(";"));
  return "﻿" + [colunas.join(";"), ...corpo].join("\r\n");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dias = Math.min(365, Math.max(1, Number(url.searchParams.get("dias")) || 7));
  const desde = new Date();
  desde.setDate(desde.getDate() - (dias - 1));
  desde.setHours(0, 0, 0, 0);

  const supabase = await createSupabaseServerClient();

  // RLS vale aqui igual à tela: quem baixa leva o que enxerga, não a base toda.
  const { data, error } = await supabase
    .from("v_bi_interaction_hourly")
    .select("rede, loja, cidade, uf, codigo, aparelho, hora_local, recurso, categoria, sessoes, segundos")
    .gte("hora_local", desde.toISOString())
    .order("hora_local", { ascending: true })
    .limit(50000);

  if (error) {
    return new Response("Não foi possível gerar o arquivo.", { status: 500 });
  }

  const linhas = (data ?? []).map((l) => ({
    rede: l.rede ?? "",
    loja: l.loja ?? "",
    cidade: l.cidade ?? "",
    uf: l.uf ?? "",
    codigo: l.codigo ?? "",
    aparelho: l.aparelho ?? "",
    // Data e hora separadas: em coluna única o Excel decide o formato sozinho
    // e cada máquina decide diferente.
    data: String(l.hora_local).slice(0, 10),
    hora: String(l.hora_local).slice(11, 16),
    recurso: l.recurso ?? "",
    categoria: l.categoria ?? "",
    sessoes: l.sessoes ?? 0,
    segundos: l.segundos ?? 0,
  }));

  const hoje = new Date().toISOString().slice(0, 10);
  return new Response(csv(linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="linka-interacao-${hoje}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
