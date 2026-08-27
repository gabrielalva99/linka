import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LinkaLogo } from "../../linka-logo";
import { Formulario } from "./formulario";

/**
 * A tela que o vendedor abre para receber aviso dos aparelhos da loja dele.
 *
 * ── POR QUE ELA EXISTE ─────────────────────────────────────────────────────
 * Em 25/08 o aviso de aparelho apagado saiu por e-mail às 13h41 e o aparelho
 * ficou seis horas fora do ar, porque quem podia plugar o cabo não recebe
 * e-mail. Avisar quem não pode agir é o mesmo que não avisar.
 *
 * ── POR QUE AUTO-CADASTRO E NÃO DIGITAR POR ELE ────────────────────────────
 * Número anotado por terceiro erra, e erra em silêncio: a mensagem sai, ninguém
 * recebe, e o painel acha que avisou. Quem digita o próprio número confere na
 * hora, e o cadastro guarda que foi ele mesmo (`confirmado_em`).
 */
export default async function CadastroDeContato({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("convite_de_contato", { p_token: token });
  const convite = ((data ?? []) as {
    rotulo: string;
    cliente: string;
    lojas: string[];
  }[])[0];

  // Convite inválido ou vencido some por completo, sem dizer qual dos dois. O
  // link é um segredo, e responder "vencido" contaria que ele já existiu.
  if (!convite) notFound();

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <LinkaLogo className="h-8 w-auto" />
        </div>

        <h1 className="text-lg font-semibold">Receber aviso dos aparelhos</h1>
        <p className="mt-1 text-sm text-muted">{convite.rotulo}</p>

        <div className="mt-4 rounded-lg border border-line bg-surface p-4">
          <p className="text-xs text-muted">Você vai receber aviso sobre</p>
          <ul className="mt-2 flex flex-col gap-1">
            {convite.lojas.map((loja) => (
              <li key={loja} className="text-sm">
                {loja}
              </li>
            ))}
          </ul>
        </div>

        <Formulario token={token} />

        <p className="mt-6 text-xs text-muted">
          Usamos seu nome e telefone só para avisar sobre os aparelhos destas
          lojas. Para sair, responda SAIR em qualquer mensagem.
        </p>
      </div>
    </main>
  );
}
