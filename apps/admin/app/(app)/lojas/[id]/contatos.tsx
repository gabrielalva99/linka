"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { linkDeCadastro, desativarContato } from "./actions";
import { convitePorMensagem } from "@/lib/bot";

export type Contato = {
  id: string;
  nome: string;
  celular: string;
  canal: string;
  id_no_canal: string | null;
  confirmado_em: string | null;
};

/** "5511988887777" vira "(11) 98888-7777". Guardado cru, mostrado legível. */
function legivel(fone: string): string {
  const n = fone.startsWith("55") ? fone.slice(2) : fone;
  if (n.length < 10) return fone;
  const ddd = n.slice(0, 2);
  const resto = n.slice(2);
  const meio = resto.length > 8 ? resto.slice(0, 5) : resto.slice(0, 4);
  return `(${ddd}) ${meio}-${resto.slice(meio.length)}`;
}

/**
 * Quem recebe aviso desta loja.
 *
 * ── POR QUE LINK E NÃO CAMPO DE TELEFONE ───────────────────────────────────
 * Número digitado por terceiro erra em silêncio: a mensagem sai, ninguém
 * recebe, e o painel acha que avisou. Quem digita o próprio número confere na
 * hora, e o cadastro guarda que foi a própria pessoa.
 *
 * O mesmo link atende o vendedor de uma loja e o gerente que cuida de quinze:
 * quem cuida de várias abre um link de cada, e o cadastro junta pelo telefone.
 */
export function Contatos({
  storeId,
  storeNome,
  contatos,
  podeOperar,
}: {
  storeId: string;
  storeNome: string;
  contatos: Contato[];
  podeOperar: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="mt-8">
      <h2 className="text-sm font-medium text-muted">Quem recebe aviso</h2>

      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        {contatos.length > 0 ? (
          <ul className="divide-y divide-line">
            {contatos.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between bg-surface px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{c.nome}</p>
                  <p className="text-xs text-muted">
                    {legivel(c.celular)}
                    {c.confirmado_em ? " · confirmou o próprio número" : ""}
                  </p>
                  {/* CADASTRADO NÃO É O MESMO QUE ALCANÇÁVEL. No Telegram o bot
                      só consegue escrever depois que a pessoa inicia a conversa,
                      e sem este aviso a loja apareceria coberta quando não está. */}
                  {!c.id_no_canal && (
                    <p className="mt-0.5 text-xs text-warning">
                      ainda não iniciou a conversa com o bot
                    </p>
                  )}
                </div>
                {podeOperar && (
                  <button
                    onClick={() =>
                      startTransition(async () => {
                        const r = await desativarContato(c.id, storeId);
                        if (!r.ok) setErro(r.error);
                        router.refresh();
                      })
                    }
                    disabled={pending}
                    className="text-xs text-muted hover:text-danger hover:underline disabled:opacity-40"
                  >
                    Remover
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="bg-surface px-4 py-6 text-center text-sm text-muted">
            Ninguém recebe aviso desta loja ainda. Sem isso, aparelho parado só
            aparece aqui no painel.
          </p>
        )}
      </div>

      {podeOperar && (
        <div className="mt-3">
          {link ? (
            <div className="rounded-lg border border-line bg-surface p-4">
              <p className="text-xs text-muted">
                Mande esta mensagem para quem cuida da loja. Ela já explica os
                dois passos e leva ao cadastro e ao bot.
              </p>
              {/* O que se copia é a MENSAGEM, não a URL. Link solto colado no
                  WhatsApp de um vendedor, sem contexto, não é clicado: ninguém
                  abre endereço estranho mandado por alguém que ele não conhece. */}
              <pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
                {convitePorMensagem(link, storeNome)}
              </pre>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(convitePorMensagem(link, storeNome));
                  setCopiado(true);
                }}
                className="mt-2 rounded-md border border-line px-3 py-1.5 text-xs hover:bg-surface-2"
              >
                {copiado ? "Copiado" : "Copiar mensagem"}
              </button>
            </div>
          ) : (
            <button
              onClick={() =>
                startTransition(async () => {
                  const r = await linkDeCadastro(storeId);
                  if (!r.ok) {
                    setErro(r.error);
                    return;
                  }
                  setLink(`${window.location.origin}/cadastro/${r.token}`);
                })
              }
              disabled={pending}
              className="text-xs text-muted hover:text-primary hover:underline disabled:opacity-40"
            >
              {pending ? "Gerando…" : "Gerar link de cadastro"}
            </button>
          )}
          {erro && <p className="mt-2 text-xs text-danger">{erro}</p>}
        </div>
      )}
    </div>
  );
}
