"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { getMessages } from "@/lib/i18n";

/**
 * Busca por nome, na URL.
 *
 * NA URL, e não em estado do componente, porque a lista é montada no servidor: é
 * ele quem tem o banco e quem sabe filtrar sem trazer tudo para o navegador. Um
 * efeito colateral bom é que o resultado vira endereço — dá para mandar "olha
 * essa peça aqui" por mensagem.
 */
export function Busca({ inicial }: { inicial: string }) {
  const t = getMessages();
  const router = useRouter();
  const params = useSearchParams();
  const [texto, setTexto] = useState(inicial);

  function buscar(valor: string) {
    const novo = new URLSearchParams(params.toString());
    if (valor.trim()) novo.set("q", valor.trim());
    else novo.delete("q");
    // Voltar para a primeira página: manter a página 3 de uma busca antiga
    // mostra "nenhum resultado" numa busca que tem resultados.
    novo.delete("p");
    router.push(`/biblioteca?${novo.toString()}`);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        buscar(texto);
      }}
      className="flex items-center gap-2"
    >
      <label htmlFor="busca-biblioteca" className="sr-only">
        {t.library.search}
      </label>
      <input
        id="busca-biblioteca"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={t.library.search}
        className="min-w-48 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
      />
      {inicial && (
        <button
          type="button"
          onClick={() => {
            setTexto("");
            buscar("");
          }}
          className="px-2 py-2 text-xs text-muted hover:text-foreground hover:underline"
        >
          {t.library.searchClear}
        </button>
      )}
    </form>
  );
}
