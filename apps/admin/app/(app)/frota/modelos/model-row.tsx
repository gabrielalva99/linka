"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { deleteModel, renameModel } from "./actions";

/**
 * Linha do modelo: corrigir o nome e excluir com trava.
 *
 * A trava mostra quantos aparelhos usam o modelo antes de recusar. Uma recusa
 * que só diz "não foi possível" faz a pessoa tentar de novo achando que foi
 * falha de rede.
 */
export function ModelRow({
  id,
  nome,
  linha,
  aparelhos,
}: {
  id: string;
  nome: string;
  linha: string | null;
  aparelhos: number;
}) {
  const t = getMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [n, setN] = useState(nome);
  const [l, setL] = useState(linha ?? "");
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const campo =
    "rounded-md border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-primary";

  if (editando) {
    return (
      <tr className="bg-surface">
        <td className="px-4 py-2">
          <input value={n} onChange={(e) => setN(e.target.value)} className={campo} autoFocus />
        </td>
        <td className="px-4 py-2">
          <input value={l} onChange={(e) => setL(e.target.value)} className={campo} />
        </td>
        <td className="px-4 py-2 text-right">
          <button
            onClick={() =>
              startTransition(async () => {
                const r = await renameModel(id, n, l);
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
            {t.models.save}
          </button>
          <button
            onClick={() => {
              setEditando(false);
              setN(nome);
              setL(linha ?? "");
            }}
            className="ml-2 text-xs text-muted hover:underline"
          >
            {t.models.cancel}
          </button>
          {erro && <span className="ml-2 text-xs text-danger">{erro}</span>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-surface">
      <td className="px-4 py-3 font-medium">
        {nome}
        <span className="ml-2 text-xs text-muted">
          {t.models.devices.replace("{n}", String(aparelhos))}
        </span>
      </td>
      <td className="px-4 py-3 text-muted">{linha ?? "—"}</td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        {erro && <span className="mr-2 text-xs text-danger">{erro}</span>}
        {confirmando ? (
          <>
            <span className="mr-2 text-xs text-muted">{t.models.confirmDelete}</span>
            <button
              onClick={() =>
                startTransition(async () => {
                  const r = await deleteModel(id);
                  if (!r.ok) setErro(r.error);
                  setConfirmando(false);
                  router.refresh();
                })
              }
              disabled={pending}
              className="rounded-md border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-40"
            >
              {t.models.confirm}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setEditando(true)}
              className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-surface-2"
            >
              {t.models.rename}
            </button>
            <button
              onClick={() => {
                setErro(null);
                setConfirmando(true);
              }}
              className="ml-2 rounded-md border border-line px-2 py-1 text-xs text-muted hover:border-danger hover:text-danger"
            >
              {t.models.delete}
            </button>
          </>
        )}
      </td>
    </tr>
  );
}
