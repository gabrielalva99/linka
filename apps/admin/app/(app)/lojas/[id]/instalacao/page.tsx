import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { svgDoQr } from "@/lib/qr-instalacao";

/**
 * A folha que o promotor leva para a loja.
 *
 * Feita para ser lida do celular dele OU impressa e ir junto com o aparelho. Por
 * isso o QR sai em SVG (não perde nitidez no papel) e a página inteira cabe numa
 * folha, sem menu e sem nada que atrapalhe a impressão.
 */
export default async function Instalacao({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: loja } = await supabase
    .from("stores")
    .select("id, name, code, city, state, tenants(name, enrollment_code)")
    .eq("id", id)
    .maybeSingle();
  if (!loja) notFound();

  const cliente = Array.isArray(loja.tenants) ? loja.tenants[0] : loja.tenants;

  // A versão publicada é a que o aparelho vai baixar. Se ninguém publicou ainda,
  // não existe QR possível — e dizer isso é melhor do que entregar um código que
  // falha na loja, com o promotor sozinho e sem como saber por quê.
  const { data: versao } = await supabase
    .from("agent_releases")
    .select("version, url")
    .eq("is_current", true)
    .maybeSingle();

  const codigo = cliente?.enrollment_code && loja.code
    ? `${cliente.enrollment_code}-${loja.code}`
    : null;

  const pronto = Boolean(codigo && versao?.url);
  const svg = pronto
    ? await svgDoQr({ codigo: codigo!, apkUrl: versao!.url })
    : null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 print:px-0 print:py-0">
      <div className="print:hidden">
        <Link href="/lojas" className="text-sm text-muted hover:text-foreground">
          ← Lojas
        </Link>
      </div>

      <h1 className="mt-4 text-2xl font-semibold">Instalar aparelho novo</h1>
      <p className="mt-1 text-muted">
        {loja.name}
        {loja.city ? ` · ${loja.city}` : ""}
        {loja.state ? `/${loja.state}` : ""}
      </p>

      {!pronto ? (
        <div className="mt-6 rounded-xl border border-warning/40 bg-warning/10 p-5">
          <p className="text-sm font-semibold text-warning">
            Ainda não dá para gerar o código desta loja
          </p>
          <p className="mt-2 text-sm text-muted">
            {!loja.code
              ? "Esta loja está sem código. Abra o cadastro da loja e preencha o campo Código."
              : "Nenhuma versão do aplicativo foi publicada ainda. Publique uma versão em Frota → Versões."}
          </p>
        </div>
      ) : (
        <>
          <ol className="mt-6 flex flex-col gap-3 text-sm">
            {[
              "Ligue o aparelho novo, ainda lacrado.",
              "Na primeira tela, toque 6 vezes no meio da tela.",
              "Conecte no wi-fi da loja quando ele pedir.",
              "Aponte a câmera para o código abaixo.",
              "Aguarde até a vitrine aparecer sozinha. Não toque em mais nada.",
            ].map((passo, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="pt-0.5">{passo}</span>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex justify-center rounded-xl border border-line bg-white p-6">
            <div
              className="[&>svg]:h-auto [&>svg]:w-full [&>svg]:max-w-[320px]"
              dangerouslySetInnerHTML={{ __html: svg! }}
            />
          </div>

          <p className="mt-4 text-center text-xs text-muted">
            Este código vale só para <strong>{loja.name}</strong>. Usar o de outra
            loja faz o aparelho aparecer no lugar errado nos relatórios.
          </p>

          <div className="mt-6 rounded-xl border border-line bg-surface p-4 print:hidden">
            <p className="text-sm font-medium">Se algo não funcionar</p>
            <p className="mt-1 text-xs text-muted">
              O aparelho precisa estar recém-saído da caixa, na tela de
              boas-vindas. Aparelho que já foi usado não aceita este código — nesse
              caso avise o escritório, não tente resolver na loja.
            </p>
          </div>

          <button
            className="mt-6 w-full rounded-md border border-line px-4 py-2 text-sm text-muted print:hidden"
            // Sem JS: a impressão é do navegador, e o link direto para a página
            // já abre pronto para imprimir.
          >
            Para imprimir, use Ctrl+P
          </button>
        </>
      )}
    </div>
  );
}
