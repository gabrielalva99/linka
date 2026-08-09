"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setVariantOf } from "./actions";

export type PecaPrincipal = { id: string; name: string };

/**
 * Liga um arquivo a uma peça, como a versão dela para outro formato de tela.
 *
 * Só aparece para quem pode operar. A lista oferece apenas peças principais —
 * variante de variante é recusada pelo banco, e oferecer na tela uma opção que
 * vai ser recusada é ensinar a pessoa a desconfiar do painel.
 */
export function VariantPicker({
  mediaId,
  atual,
  opcoes,
  temDimensao,
}: {
  mediaId: string;
  atual: string | null;
  opcoes: PecaPrincipal[];
  temDimensao: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted">Versão de</span>
      <select
        value={atual ?? ""}
        disabled={pending}
        onChange={(e) => {
          const valor = e.target.value || null;
          setErro(null);
          startTransition(async () => {
            const r = await setVariantOf(mediaId, valor);
            if (!r.ok) setErro(r.error);
            router.refresh();
          });
        }}
        className="max-w-56 rounded-md border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-primary disabled:opacity-40"
      >
        <option value="">— peça própria —</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>

      {/* Vincular sem saber o formato não serve para nada: a escolha só olha
          arquivos com resolução conhecida. Dizer isso aqui evita o operador
          montar o conjunto todo e não entender por que a vitrine ignorou. */}
      {atual && !temDimensao && (
        <span className="text-xs text-warning">
          sem resolução — este arquivo não será escolhido
        </span>
      )}
      {erro && <span className="text-xs text-danger">{erro}</span>}
    </div>
  );
}
