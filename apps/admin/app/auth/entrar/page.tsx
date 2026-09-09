import { LinkaLogo } from "../../linka-logo";
import { entrarComToken } from "./actions";

/**
 * Onde o link do e-mail termina: painel.linkaretail.com.br/auth/entrar.
 *
 * ── ESTA PÁGINA NÃO ENTRA NINGUÉM SOZINHA, E ISSO É O PONTO ─────────────────
 * Ela lê o token do endereço e não faz nada com ele. Mostra um botão. A troca
 * do token pela sessão só acontece quando alguém clica, em `entrarComToken`.
 *
 * ── A MEDIÇÃO QUE MOSTROU ISSO (08/09, no log do Auth) ─────────────────────
 * O Gabriel pediu um link e clicou UMA vez. O Supabase recebeu DUAS chamadas:
 *
 *   02:40:21  POST /verify  200          token consumido, sessão criada
 *   02:40:22  POST /verify  403          otp_expired, um segundo depois
 *
 * As duas saíram do nosso servidor, porque as duas abriram este endereço. A
 * primeira é o verificador de links da Microsoft, que ao receber o clique abre
 * o destino antes de soltar a pessoa, para conferir se é golpe. A segunda é o
 * navegador dela, chegando num link que já tinha sido gasto um segundo antes.
 * Foi por isso que quatro convites seguidos "expiraram" sem ninguém ter
 * conseguido usar nenhum.
 *
 * O filtro NÃO faz isso na entrega, só no clique: uma sonda que dispara o e-mail
 * e não toca em nada volta limpa e engana. Foi o que aconteceu aqui antes desta
 * medição.
 *
 * Robô abre. Robô não clica.
 *
 * O custo para quem recebe é um clique a mais, e ele nem parece um degrau: a
 * pessoa vem de um botão do e-mail e encontra outro botão dizendo a mesma coisa.
 */
export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash: tokenHash, type: tipo } = await searchParams;

  const semLink = !tokenHash || !tipo;

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <LinkaLogo className="h-8 w-auto" />
        </div>

        {semLink ? (
          <>
            <h1 className="text-lg font-semibold">Link incompleto</h1>
            <p className="mt-1 text-sm text-muted">
              Este endereço chegou sem as informações de acesso. Peça um link novo
              na tela de entrada.
            </p>
            <a
              href="/login"
              className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Ir para a entrada
            </a>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Confirme que é você</h1>
            <p className="mt-1 text-sm text-muted">
              Clique no botão abaixo para entrar no painel. O acesso vale uma vez
              só, então ele só é usado quando você clicar.
            </p>

            <form action={entrarComToken} className="mt-6">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={tipo} />
              <button
                type="submit"
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Entrar no painel
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
