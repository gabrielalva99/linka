"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteTenant,
  entrarNoCliente,
  renameTenant,
  resetEnrollmentCode,
} from "./actions";

/**
 * Linha do cliente: entrar, renomear e trocar o código de inscrição.
 *
 * "Entrar" é a ação principal e por isso é a única em destaque — é o que a
 * pessoa vem fazer aqui em 99% das vezes. Renomear e trocar código são raros e
 * ficam discretos, mas no lugar onde se procura por eles.
 */
export function TenantRow({
  id,
  nome,
  slug,
  codigo,
  aparelhos,
  lojas,
  pessoas,
  ativo,
}: {
  id: string;
  nome: string;
  slug: string;
  codigo: string;
  aparelhos: number;
  lojas: number;
  pessoas: number;
  ativo: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(nome);
  const [confirmandoCodigo, setConfirmandoCodigo] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (editando) {
    return (
      <tr className="bg-surface">
        <td className="px-4 py-2" colSpan={6}>
          <span className="flex flex-wrap items-center gap-2">
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="min-w-48 rounded-md border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary"
              autoFocus
            />
            <button
              onClick={() =>
                startTransition(async () => {
                  const r = await renameTenant(id, valor);
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
              Salvar
            </button>
            <button
              onClick={() => {
                setEditando(false);
                setValor(nome);
                setErro(null);
              }}
              className="text-xs text-muted hover:underline"
            >
              Cancelar
            </button>
            {erro && <span className="text-xs text-danger">{erro}</span>}
          </span>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-surface">
      <td className="px-4 py-3 font-medium">
        {nome}
        {ativo && (
          <span className="ml-2 whitespace-nowrap rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">
            aberto agora
          </span>
        )}
        <span className="block text-xs text-muted">{slug}</span>
      </td>
      <td className="px-4 py-3 text-muted">{aparelhos}</td>
      <td className="px-4 py-3 text-muted">{lojas}</td>
      <td className="px-4 py-3 text-muted">{pessoas}</td>
      <td className="whitespace-nowrap px-4 py-3">
        <span className="font-mono text-xs">{codigo}</span>
        {confirmandoCodigo ? (
          <span className="ml-2 inline-flex items-center gap-2">
            <span className="text-xs text-muted">Trocar? O antigo para de valer.</span>
            <button
              onClick={() =>
                startTransition(async () => {
                  const r = await resetEnrollmentCode(id);
                  if (!r.ok) setErro(r.error);
                  setConfirmandoCodigo(false);
                  router.refresh();
                })
              }
              disabled={pending}
              className="rounded-md border border-warning/40 px-2 py-1 text-xs text-warning hover:bg-warning/10 disabled:opacity-40"
            >
              Trocar
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmandoCodigo(true)}
            className="ml-2 text-xs text-muted hover:underline"
          >
            trocar
          </button>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        {erro && <span className="mr-2 text-xs text-danger">{erro}</span>}
        {confirmandoExclusao ? (
          <>
            <span className="mr-2 text-xs text-muted">
              Excluir {nome}? Não tem volta.
            </span>
            <button
              onClick={() =>
                startTransition(async () => {
                  const r = await deleteTenant(id);
                  if (!r.ok) setErro(r.error);
                  setConfirmandoExclusao(false);
                  router.refresh();
                })
              }
              disabled={pending}
              className="rounded-md border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-40"
            >
              Excluir
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setEditando(true)}
              className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-surface-2"
            >
              Renomear
            </button>
            {/* Excluir some do cliente aberto: apagar o chão em que você está
                pisando é um estado que ninguém precisa alcançar. */}
            {!ativo && (
              <button
                onClick={() => {
                  setErro(null);
                  setConfirmandoExclusao(true);
                }}
                className="ml-2 rounded-md border border-line px-2 py-1 text-xs text-muted hover:border-danger hover:text-danger"
              >
                Excluir
              </button>
            )}
            {!ativo && (
              <button
                onClick={() => startTransition(() => entrarNoCliente(id))}
                disabled={pending}
                className="ml-2 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
              >
                Entrar
              </button>
            )}
          </>
        )}
      </td>
    </tr>
  );
}
