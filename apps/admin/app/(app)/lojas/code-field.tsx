"use client";

import { useState, useTransition } from "react";
import { getMessages } from "@/lib/i18n";
import { gerarCodigoDeLoja } from "./codigo";

/**
 * O campo do código da loja, com o botão de gerar ao lado.
 *
 * Os dois caminhos ficam à vista de propósito: digitar o código do PDV que a
 * rede já usa (o certo, quando existe) ou gerar um. Esconder o gerador faria
 * alguém deixar o campo vazio — e loja sem código não recebe aparelho no campo.
 */
export function CodeField({
  defaultValue = "",
  className,
}: {
  defaultValue?: string;
  className: string;
}) {
  const t = getMessages();
  const [valor, setValor] = useState(defaultValue);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-muted">{t.stores.code}</span>
      <span className="flex items-center gap-2">
        <input
          name="code"
          value={valor}
          onChange={(e) => setValor(e.target.value.toUpperCase())}
          placeholder="SPC0000"
          className={`${className} flex-1`}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await gerarCodigoDeLoja();
              if ("erro" in r) setErro(r.erro);
              else {
                setValor(r.codigo);
                setErro(null);
              }
            })
          }
          className="whitespace-nowrap rounded-md border border-line px-3 py-2 text-xs text-muted hover:bg-surface-2 disabled:opacity-40"
        >
          {pending ? "…" : t.stores.generateCode}
        </button>
      </span>
      <span className="text-xs text-muted">{t.stores.codeHint}</span>
      {erro && <span className="text-xs text-danger">{erro}</span>}
    </label>
  );
}
