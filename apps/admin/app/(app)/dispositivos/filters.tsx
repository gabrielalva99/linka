"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getMessages } from "@/lib/i18n";

/**
 * Busca e filtros da lista de aparelhos.
 *
 * O estado mora na URL, não no componente. Com 250 aparelhos, o movimento
 * normal é filtrar, abrir um aparelho, resolver e voltar: se o filtro morar na
 * tela, o voltar do navegador devolve a lista inteira e a pessoa refaz tudo.
 * Na URL, o link também pode ser mandado para outra pessoa.
 */
export function Filters({
  lojas,
  busca,
  loja,
  situacao,
}: {
  lojas: { id: string; nome: string }[];
  busca: string;
  loja: string;
  situacao: string;
}) {
  const t = getMessages();
  const router = useRouter();
  const params = useSearchParams();
  const [texto, setTexto] = useState(busca);

  // Digitar não pode disparar uma consulta por tecla. Meio segundo parado é o
  // sinal de que a pessoa terminou de escrever.
  useEffect(() => {
    const id = setTimeout(() => {
      if (texto === busca) return;
      const p = new URLSearchParams(params.toString());
      if (texto) p.set("q", texto);
      else p.delete("q");
      router.replace(`/dispositivos?${p.toString()}`);
    }, 500);
    return () => clearTimeout(id);
  }, [texto, busca, params, router]);

  function trocar(chave: string, valor: string) {
    const p = new URLSearchParams(params.toString());
    if (valor) p.set(chave, valor);
    else p.delete(chave);
    router.replace(`/dispositivos?${p.toString()}`);
  }

  const field =
    "rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";
  const limpou = busca || loja || situacao;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={t.fleet.searchPlaceholder}
        className={`${field} min-w-56 flex-1`}
      />
      <select
        value={loja}
        onChange={(e) => trocar("loja", e.target.value)}
        className={field}
      >
        <option value="">{t.fleet.allStores}</option>
        <option value="sem">{t.fleet.noStoreFilter}</option>
        {lojas.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nome}
          </option>
        ))}
      </select>
      <select
        value={situacao}
        onChange={(e) => trocar("situacao", e.target.value)}
        className={field}
      >
        <option value="">{t.fleet.anyStatus}</option>
        <option value="problema">{t.fleet.withProblem}</option>
        <option value="offline">{t.fleet.offlineOnly}</option>
        <option value="sem_travas">{t.fleet.unlockedOnly}</option>
        <option value="desatualizado">{t.fleet.outdatedOnly}</option>
        <option value="app_extra">{t.fleet.extraAppsOnly}</option>
        {/* Arquivados ficam FORA de todas as outras opções: é o único filtro que
            mostra o que a lista esconde por padrão. */}
        <option value="arquivados">{t.fleet.archivedOnly}</option>
      </select>
      {limpou && (
        <button
          onClick={() => router.replace("/dispositivos")}
          className="rounded-md border border-line px-3 py-2 text-xs text-muted hover:bg-surface-2"
        >
          {t.fleet.clearFilters}
        </button>
      )}
    </div>
  );
}
