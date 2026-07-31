"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { makeCurrent } from "./actions";

/**
 * Aponta a frota de volta para uma versão antiga.
 *
 * Avisa o que isso NÃO faz: o atualizador só instala versão maior, então quem já
 * baixou a nova continua nela. Serve para segurar o resto da frota, e a tela tem
 * que dizer isso — senão alguém clica achando que desfez.
 */
export function RollbackButton({ id, version }: { id: string; version: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState(false);

  if (confirmando) {
    return (
      <span className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted">
          Aparelhos já atualizados continuam na versão nova.
        </span>
        <button
          onClick={() =>
            startTransition(async () => {
              await makeCurrent(id);
              setConfirmando(false);
              router.refresh();
            })
          }
          disabled={pending}
          className="rounded-md border border-warning/40 px-3 py-1 text-xs text-warning hover:bg-warning/10 disabled:opacity-40"
        >
          {pending ? "Voltando…" : "Confirmar"}
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirmando(true)}
      className="rounded-md border border-line px-3 py-1 text-xs text-muted hover:bg-surface-2"
      title={`Fazer a frota voltar para a ${version}`}
    >
      Voltar para esta
    </button>
  );
}
