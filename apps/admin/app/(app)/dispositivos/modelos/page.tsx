import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { podeOperarAgora } from "@/lib/perms";
import { porCliente, tenantFilter } from "@/lib/tenant";
import { aparelhosPorModelo } from "@/lib/contagens";
import { CreateModelForm } from "./create-form";
import { ModelRow } from "./model-row";

export default async function ModelosPage() {
  const supabase = await createSupabaseServerClient();
  const filtro = await tenantFilter();
  // A contagem vem de view agrupada, e nao da contagem embutida: a embutida nao
  // aceita filtro e somava aparelho arquivado, inflando o peso de cada modelo.
  const [{ data: models }, aparelhos, { data: telasReportadas }] = await Promise.all([
    porCliente(
      supabase.from("device_models").select("id, name, line, screen_width, screen_height"),
      filtro,
    )
      .order("line", { ascending: true })
      .order("name", { ascending: true }),
    aparelhosPorModelo(supabase, filtro),
    // O QUE OS APARELHOS DIZEM DA PRÓPRIA TELA.
    //
    // Desde a 0.76.0 cada aparelho informa o tamanho da tela em que a vitrine
    // aparece, a cada batida. Isso torna o cadastro manual desnecessário na
    // maioria dos casos: em vez de alguém descobrir "1224x2992" e digitar, a
    // tela propõe o que o próprio hardware está reportando.
    porCliente(
      supabase
        .from("devices")
        .select("model_id, screen_width, screen_height")
        .not("model_id", "is", null)
        .not("screen_width", "is", null)
        .is("archived_at", null),
      filtro,
    ),
  ]);
  const t = getMessages();
  const podeEditar = await podeOperarAgora();

  // Agrupa por modelo e por formato: dobrável exposto aberto e fechado reporta
  // telas diferentes, e a tela precisa mostrar isso em vez de escolher sozinha.
  const reportesPorModelo = new Map<string, Map<string, number>>();
  for (const d of (telasReportadas ?? []) as {
    model_id: string;
    screen_width: number;
    screen_height: number;
  }[]) {
    const chave = `${d.screen_width}x${d.screen_height}`;
    const doModelo = reportesPorModelo.get(d.model_id) ?? new Map<string, number>();
    doModelo.set(chave, (doModelo.get(chave) ?? 0) + 1);
    reportesPorModelo.set(d.model_id, doModelo);
  }
  const sugestoesDe = (modelId: string) =>
    [...(reportesPorModelo.get(modelId) ?? new Map()).entries()]
      .map(([tela, n]) => {
        const [w, h] = tela.split("x").map(Number);
        return { largura: w, altura: h, aparelhos: n as number };
      })
      .sort((a, b) => b.aparelhos - a.aparelhos);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dispositivos" className="text-sm text-muted hover:underline">
        ← {t.fleet.title}
      </Link>
      <h1 className="mt-2 text-xl font-semibold">{t.models.title}</h1>

      {podeEditar && (
        <div className="mt-6">
          <CreateModelForm />
        </div>
      )}

      {/* overflow-x-auto, e não overflow-hidden: em tela de celular as quatro
          colunas não cabem, e "hidden" CORTAVA os botões de Editar e Excluir em
          vez de deixar rolar. O promotor usa telefone. */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-line">
        {models && models.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{t.models.colName}</th>
                <th className="px-4 py-2 font-medium">{t.models.colLine}</th>
                <th className="px-4 py-2 font-medium">{t.models.screen}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {models.map((m) => (
                <ModelRow
                  key={m.id as string}
                  id={m.id as string}
                  nome={m.name as string}
                  linha={m.line as string | null}
                  telaLargura={m.screen_width as number | null}
                  telaAltura={m.screen_height as number | null}
                  sugestoes={sugestoesDe(m.id as string)}
                  aparelhos={aparelhos.get(m.id as string) ?? 0}
                  podeEditar={podeEditar}
                />
              ))}
            </tbody>
          </table>
        ) : (
          <p className="bg-surface px-4 py-6 text-center text-sm text-muted">
            {t.models.empty}
          </p>
        )}
      </div>
    </div>
  );
}
