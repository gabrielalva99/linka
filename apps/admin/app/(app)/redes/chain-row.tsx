"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { deleteChain, renameChain } from "./actions";

/**
 * Linha da rede: renomear no lugar e excluir com trava.
 *
 * Renomear abre ali mesmo, sem tela nova, porque corrigir um nome digitado
 * errado é uma correção de segundos e não merece uma navegação inteira.
 *
 * Excluir só passa se a rede estiver vazia, e a recusa diz quantas lojas
 * seguram, porque "não foi possível" manda a pessoa adivinhar.
 */
export function ChainRow({
  id,
  nome,
  lojas,
}: {
  id: string;
  nome: string;
  lojas: number;
}) {
  const t = getMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(nome);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (editando) {
    return (
      <li className="flex flex-wrap items-center gap-2 bg-surface px-4 py-3 text-sm">
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="min-w-48 flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary"
          autoFocus
        />
        <button
          onClick={() =>
            startTransition(async () => {
              const r = await renameChain(id, valor);
              if (!r.ok) setErro(r.error);
              else {
                setEditando(false);
                setErro(null);
                router.refresh();
              }
            })
          }
          disabled={pending}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
        >
          {t.chains.save}
        </button>
        <button
          onClick={() => {
            setEditando(false);
            setValor(nome);
            setErro(null);
          }}
          className="text-xs text-muted hover:underline"
        >
          {t.chains.cancel}
        </button>
        {erro && <span className="w-full text-xs text-danger">{erro}</span>}
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-2 bg-surface px-4 py-3 text-sm">
      <span className="min-w-0 flex-1">
        <span className="font-medium">{nome}</span>
        <Link
          href={`/lojas?rede=${encodeURIComponent(nome)}`}
          className="ml-2 text-xs text-muted hover:text-primary hover:underline"
        >
          {t.chains.stores.replace("{n}", String(lojas))}
        </Link>
      </span>
      {erro && <span className="text-xs text-danger">{erro}</span>}
      {confirmando ? (
        <>
          <span className="text-xs text-muted">{t.chains.confirmDelete}</span>
          <button
            onClick={() =>
              startTransition(async () => {
                const r = await deleteChain(id);
                if (!r.ok) setErro(r.error);
                setConfirmando(false);
                router.refresh();
              })
            }
            disabled={pending}
            className="rounded-md border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-40"
          >
            {t.chains.confirm}
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => setEditando(true)}
            className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-surface-2"
          >
            {t.chains.rename}
          </button>
          <button
            onClick={() => {
              setErro(null);
              setConfirmando(true);
            }}
            className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:border-danger hover:text-danger"
          >
            {t.chains.delete}
          </button>
        </>
      )}
    </li>
  );
}
