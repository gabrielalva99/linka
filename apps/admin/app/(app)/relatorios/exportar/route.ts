import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tenantFilter } from "@/lib/tenant";

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
/**
 * Segundos viram minutos, com vírgula.
 *
 * Duas correções numa: "1433" não é informação para ninguém — ninguém divide por
 * 60 de cabeça lendo planilha. E a vírgula é o separador decimal do Excel em
 * português: com ponto, "23.9" vira texto ou vira 239, dependendo da máquina —
 * o mesmo tipo de detalhe bobo que decide se a planilha presta ou não.
 *
 * Minuto e não "23min 53s" porque a coluna precisa somar. Texto bonito numa
 * planilha de BI é coluna que não entra em conta nenhuma.
 *
 * Duas casas, e não uma: a sessão mais curta que a gente mede tem 2 segundos, e
 * com uma casa ela vira 0,0 — desaparece da soma sem deixar rastro. Perder
 * número em silêncio é o defeito que eu menos quero num arquivo que vai virar
 * gráfico na frente da marca.
 */
function minutos(segundos: unknown): string {
  const n = Number(segundos);
  if (!Number.isFinite(n)) return "0,00";
  return (n / 60).toFixed(2).replace(".", ",");
}

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

  // Duas planilhas, mesmo recorte: o que o cliente USOU e o que estava NA TELA.
  // Separadas porque o grão é diferente — uma linha por recurso contra uma linha
  // por vídeo — e juntar as duas numa só produz soma de coisas que não se somam.
  const conteudo = url.searchParams.get("tipo") === "conteudo";

  // RLS vale aqui igual à tela: quem baixa leva o que enxerga, não a base toda.
  // A planilha respeita o MESMO recorte da tela. Baixar a frota inteira quando
  // a tela mostra uma loja é o caminho mais curto para alguém mandar o número
  // errado para a marca.
  // A planilha carrega o mesmo recorte de cliente da tela. Sem isso, quem opera
  // a plataforma baixaria as duas marcas no mesmo arquivo — e é esse arquivo
  // que vai por e-mail para o cliente.
  const filtroCliente = await tenantFilter();
  let consulta = conteudo
    ? supabase
        .from("v_bi_media_hourly")
        .select(
          "rede, loja, cidade, uf, tipo_local, codigo, aparelho, modelo, linha, hora_local, midia, segundos_no_ar, visitas, segundos_uso",
        )
        .gte("hora_local", desde.toISOString())
    : supabase
        .from("v_bi_interaction_hourly")
        .select(
          "rede, loja, cidade, uf, tipo_local, codigo, aparelho, modelo, linha, hora_local, recurso, categoria, sessoes, segundos",
        )
        .gte("hora_local", desde.toISOString());

  if (filtroCliente) consulta = consulta.eq("tenant_id", filtroCliente);

  const rede = url.searchParams.get("rede");
  const loja = url.searchParams.get("loja");
  const aparelho = url.searchParams.get("aparelho");
  if (rede) consulta = consulta.eq("rede", rede);
  if (loja) consulta = consulta.eq("loja", loja);
  if (aparelho) consulta = consulta.eq("codigo", aparelho);

  const { data, error } = await consulta
    .order("hora_local", { ascending: true })
    .limit(50000);

  if (error) {
    return new Response("Não foi possível gerar o arquivo.", { status: 500 });
  }

  // As duas consultas devolvem formatos diferentes; o mapeamento abaixo é que
  // decide qual coluna sai em cada planilha.
  const linhas = ((data ?? []) as Record<string, unknown>[]).map((l) => {
    const comum = {
      rede: l.rede ?? "",
      loja: l.loja ?? "",
      cidade: l.cidade ?? "",
      uf: l.uf ?? "",
      tipo_local: l.tipo_local ?? "",
      codigo: l.codigo ?? "",
      aparelho: l.aparelho ?? "",
      modelo: l.modelo ?? "",
      linha: l.linha ?? "",
      // Data e hora separadas: em coluna única o Excel decide o formato sozinho
      // e cada máquina decide diferente.
      data: String(l.hora_local).slice(0, 10),
      hora: String(l.hora_local).slice(11, 16),
    };
    return conteudo
      ? {
          ...comum,
          video: l.midia ?? "",
          minutos_no_ar: minutos(l.segundos_no_ar),
          visitas: l.visitas ?? 0,
          minutos_de_uso: minutos(l.segundos_uso),
        }
      : {
          ...comum,
          recurso: l.recurso ?? "",
          categoria: l.categoria ?? "",
          sessoes: l.sessoes ?? 0,
          minutos: minutos(l.segundos),
        };
  });

  const hoje = new Date().toISOString().slice(0, 10);
  const nome = conteudo ? "conteudo" : "interacao";
  return new Response(csv(linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="linka-${nome}-${hoje}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
