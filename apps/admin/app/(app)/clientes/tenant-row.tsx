"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteTenant,
  entrarNoCliente,
  renameTenant,
  resetEnrollmentCode,
  setMaintenancePin,
  setTenantActive,
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
  pin,
  clienteAtivo,
  aparelhos,
  lojas,
  pessoas,
  ativo,
}: {
  id: string;
  nome: string;
  slug: string;
  codigo: string;
  pin: string | null;
  clienteAtivo: boolean;
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
  const [confirmandoDesativar, setConfirmandoDesativar] = useState(false);
  const [editandoPin, setEditandoPin] = useState(false);
  const [novoPin, setNovoPin] = useState(pin ?? "");
  const [erro, setErro] = useState<string | null>(null);

  if (editando) {
    return (
      <tr className="bg-surface">
        <td className="px-4 py-2" colSpan={7}>
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
        {/* Sem isto a linha do cliente desativado fica idêntica à de um ativo, e
            a pessoa passa a tarde procurando por que ele não está no seletor. */}
        {!clienteAtivo && (
          <span className="ml-2 whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
            desativado
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
              className="rounded-md border border-warning/40 px-3 py-1.5 text-xs text-warning hover:bg-warning/10 disabled:opacity-40"
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
      {/* PIN de manutenção: o que o técnico digita no aparelho, na loja, para
          destravar a vitrine por 5 minutos. Fica aqui, ao lado do código de
          inscrição, porque são os dois segredos de campo do cliente — quem
          precisa de um normalmente precisa saber do outro.

          Mostrado por extenso de propósito: quem abre esta tela opera a
          plataforma e precisa DITAR o número por telefone para alguém que está
          dentro da loja. Esconder atrás de "revelar" só somaria um clique sem
          proteger de nada — a linha inteira já é visível para o mesmo usuário. */}
      <td className="whitespace-nowrap px-4 py-3">
        {editandoPin ? (
          <span className="inline-flex items-center gap-2">
            <input
              value={novoPin}
              onChange={(e) => setNovoPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="6 a 8 dígitos"
              inputMode="numeric"
              className="w-28 rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs outline-none focus:border-primary"
              autoFocus
            />
            <button
              onClick={() =>
                startTransition(async () => {
                  const r = await setMaintenancePin(id, novoPin);
                  if (!r.ok) setErro(r.error);
                  else {
                    setErro(null);
                    setEditandoPin(false);
                    router.refresh();
                  }
                })
              }
              disabled={pending}
              className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
            >
              Salvar
            </button>
            <button
              onClick={() => {
                setEditandoPin(false);
                setNovoPin(pin ?? "");
                setErro(null);
              }}
              className="text-xs text-muted hover:underline"
            >
              Cancelar
            </button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            {pin ? (
              <span className="font-mono text-xs">{pin}</span>
            ) : (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                sem saída na loja
              </span>
            )}
            <button
              onClick={() => setEditandoPin(true)}
              className="text-xs text-muted hover:underline"
            >
              {pin ? "trocar" : "definir"}
            </button>
          </span>
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
              className="rounded-md border border-danger/40 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-40"
            >
              Excluir
            </button>
          </>
        ) : confirmandoDesativar ? (
          <>
            {/* O aviso diz o que NÃO acontece, e é a parte que importa.
                "Desativar cliente" soa como desligar a operação dele; se as
                vitrines continuassem no ar sem isso estar escrito, alguém
                desativaria um contrato achando que apagou 250 telas — ou o
                contrário, deixaria de desativar por medo de apagar. */}
            <span className="mr-2 text-xs text-muted">
              Sai do seletor. Os aparelhos na loja continuam no ar.
            </span>
            <button
              onClick={() =>
                startTransition(async () => {
                  const r = await setTenantActive(id, false);
                  if (!r.ok) setErro(r.error);
                  setConfirmandoDesativar(false);
                  router.refresh();
                })
              }
              disabled={pending}
              className="rounded-md border border-warning/40 px-3 py-1.5 text-xs text-warning hover:bg-warning/10 disabled:opacity-40"
            >
              Desativar
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setEditando(true)}
              className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-surface-2"
            >
              Renomear
            </button>
            {/* Desativar/reativar antes de Excluir: é a saída certa para contrato
                encerrado, e Excluir só passa com o cliente vazio. */}
            {clienteAtivo ? (
              !ativo && (
                <button
                  onClick={() => {
                    setErro(null);
                    setConfirmandoDesativar(true);
                  }}
                  className="ml-2 rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-surface-2"
                >
                  Desativar
                </button>
              )
            ) : (
              <button
                onClick={() =>
                  startTransition(async () => {
                    const r = await setTenantActive(id, true);
                    if (!r.ok) setErro(r.error);
                    router.refresh();
                  })
                }
                disabled={pending}
                className="ml-2 rounded-md border border-success/40 px-3 py-1.5 text-xs text-success hover:bg-success/10 disabled:opacity-40"
              >
                Reativar
              </button>
            )}
            {/* Excluir some do cliente aberto: apagar o chão em que você está
                pisando é um estado que ninguém precisa alcançar. */}
            {!ativo && (
              <button
                onClick={() => {
                  setErro(null);
                  setConfirmandoExclusao(true);
                }}
                className="ml-2 rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:border-danger hover:text-danger"
              >
                Excluir
              </button>
            )}
            {!ativo && clienteAtivo && (
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
