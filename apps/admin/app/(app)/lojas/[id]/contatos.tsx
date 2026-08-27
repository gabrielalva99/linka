"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { linkDeCadastro, desativarContato } from "./actions";

export type Contato = {
  id: string;
  nome: string;
  whatsapp: string;
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
  contatos,
  podeOperar,
}: {
  storeId: string;
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
                    {legivel(c.whatsapp)}
                    {c.confirmado_em ? " · confirmou o próprio número" : ""}
                  </p>
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
                Mande este link para quem cuida da loja. Ele se cadastra sozinho.
              </p>
              <p className="mt-2 break-all rounded-md bg-surface-2 px-3 py-2 text-xs">
                {link}
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(link);
                  setCopiado(true);
                }}
                className="mt-2 rounded-md border border-line px-3 py-1.5 text-xs hover:bg-surface-2"
              >
                {copiado ? "Copiado" : "Copiar link"}
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
