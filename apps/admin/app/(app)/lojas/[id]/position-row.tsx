"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { deletePosition, renamePosition } from "./actions";

/**
 * Linha da posição: renomear e apagar com trava.
 *
 * Antes só existia apagar, e sem confirmação: renomear "Mesa 3" obrigava a
 * apagar e recriar, o que soltava em silêncio todos os aparelhos que estavam
 * ali. Quem chega na loja procurando o aparelho "da mesa 3" ficava sem a
 * informação que foi buscar.
 */
export function PositionRow({
  id,
  rotulo,
  storeId,
}: {
  id: string;
  rotulo: string;
  storeId: string;
}) {
  const t = getMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(rotulo);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  return (
    <li className="flex flex-wrap items-center gap-2 bg-surface px-4 py-3 text-sm">
      {editando ? (
        <>
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="min-w-40 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-primary"
            autoFocus
          />
          <button
            onClick={() =>
              startTransition(async () => {
                const r = await renamePosition(id, valor, storeId);
                if (!r.ok) setErro(r.error);
                else {
                  setEditando(false);
                  setErro(null);
                  router.refresh();
                }
              })
            }
            disabled={pending}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            {t.positions.save}
          </button>
          <button
            onClick={() => {
              setEditando(false);
              setValor(rotulo);
            }}
            className="text-xs text-muted hover:underline"
          >
            {t.positions.cancel}
          </button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1">{rotulo}</span>
          {erro && <span className="text-xs text-danger">{erro}</span>}
          {confirmando ? (
            <>
              <span className="text-xs text-muted">{t.positions.confirmDelete}</span>
              <button
                onClick={() =>
                  startTransition(async () => {
                    const r = await deletePosition(id, storeId);
                    if (!r.ok) setErro(r.error);
                    setConfirmando(false);
                    router.refresh();
                  })
                }
                disabled={pending}
                className="rounded-md border border-danger/40 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-40"
              >
                {t.positions.confirm}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditando(true)}
                className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-surface-2"
              >
                {t.positions.rename}
              </button>
              <button
                onClick={() => {
                  setErro(null);
                  setConfirmando(true);
                }}
                className="text-xs text-muted transition hover:text-danger hover:underline"
              >
                {t.positions.delete}
              </button>
            </>
          )}
        </>
      )}
    </li>
  );
}
