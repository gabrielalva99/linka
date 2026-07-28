"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { getMessages } from "@/lib/i18n";

/**
 * Recorte do relatório: rede, loja e aparelho.
 *
 * Frota inteira é a visão de abertura; a pergunta seguinte é sempre "e nesta
 * loja?". O recorte vive na URL para o link filtrado poder ser mandado por
 * mensagem, que é como o resultado circula de verdade numa reunião.
 */
export function ReportFilters({
  redes,
  lojas,
  aparelhos,
  rede,
  loja,
  aparelho,
}: {
  redes: string[];
  lojas: string[];
  aparelhos: { codigo: string; nome: string }[];
  rede: string;
  loja: string;
  aparelho: string;
}) {
  const t = getMessages();
  const router = useRouter();
  const params = useSearchParams();

  function trocar(chave: string, valor: string) {
    const p = new URLSearchParams(params.toString());
    if (valor) p.set(chave, valor);
    else p.delete(chave);
    // Trocar de rede ou de loja invalida o recorte mais fino: manter o aparelho
    // deixaria a tela mostrando um filtro que não existe mais no resultado.
    if (chave === "rede") {
      p.delete("loja");
      p.delete("aparelho");
    }
    if (chave === "loja") p.delete("aparelho");
    router.replace(`/relatorios?${p.toString()}`);
  }

  const field =
    "rounded-md border border-line bg-surface px-3 py-1.5 text-xs outline-none focus:border-primary";

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <select value={rede} onChange={(e) => trocar("rede", e.target.value)} className={field}>
        <option value="">{t.reports.allChains}</option>
        {redes.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <select value={loja} onChange={(e) => trocar("loja", e.target.value)} className={field}>
        <option value="">{t.reports.allStores}</option>
        {lojas.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      <select
        value={aparelho}
        onChange={(e) => trocar("aparelho", e.target.value)}
        className={field}
      >
        <option value="">{t.reports.allDevices}</option>
        {aparelhos.map((a) => (
          <option key={a.codigo} value={a.codigo}>
            {a.codigo ? `${a.codigo} · ` : ""}
            {a.nome}
          </option>
        ))}
      </select>
      {(rede || loja || aparelho) && (
        <button
          onClick={() => {
            const p = new URLSearchParams(params.toString());
            p.delete("rede");
            p.delete("loja");
            p.delete("aparelho");
            router.replace(`/relatorios?${p.toString()}`);
          }}
          className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-surface-2"
        >
          {t.reports.clearFilters}
        </button>
      )}
    </div>
  );
}
