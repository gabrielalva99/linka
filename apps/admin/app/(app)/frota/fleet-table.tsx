"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import type { DeviceStatus } from "@linka/shared";
import { StatusBadge } from "./status-badge";
import { definirEmMassa } from "./bulk-actions";

export type Linha = {
  id: string;
  status: DeviceStatus;
  codigo: string;
  nome: string;
  modelo: string;
  lojaId: string | null;
  lojaNome: string;
  modo: string;
  bateria: string;
  versao: string;
  visto: string;
};

export type Opcao = { id: string; nome: string };

/**
 * A lista da frota, com seleção múltipla.
 *
 * A seleção só existe para quem pode operar: para quem lê, caixinha que não
 * leva a lugar nenhum é ruído na tela.
 *
 * A barra de ações aparece só com algo selecionado, e some sozinha depois de
 * aplicar. Barra fixa mostrando "0 selecionados" ocupa espaço o tempo todo para
 * ser útil em dez segundos do dia.
 */
export function FleetTable({
  linhas,
  lojas,
  modelos,
  podeMexer,
}: {
  linhas: Linha[];
  lojas: Opcao[];
  modelos: Opcao[];
  podeMexer: boolean;
}) {
  const t = getMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [loja, setLoja] = useState("");
  const [modelo, setModelo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const todosMarcados = linhas.length > 0 && marcados.size === linhas.length;

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarTodos() {
    setMarcados(todosMarcados ? new Set() : new Set(linhas.map((l) => l.id)));
  }

  function aplicar() {
    const alvo: { storeId?: string; modelId?: string } = {};
    if (loja) alvo.storeId = loja;
    if (modelo) alvo.modelId = modelo;
    if (!alvo.storeId && !alvo.modelId) {
      setErro("Escolha a loja ou o modelo.");
      return;
    }
    startTransition(async () => {
      const r = await definirEmMassa([...marcados], alvo);
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setErro(null);
      setMarcados(new Set());
      setLoja("");
      setModelo("");
      router.refresh();
    });
  }

  const campo =
    "rounded-md border border-line bg-surface px-3 py-1.5 text-xs outline-none focus:border-primary";

  return (
    <>
      {podeMexer && marcados.size > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3">
          <span className="text-sm font-medium text-primary">
            {marcados.size === 1
              ? "1 aparelho selecionado"
              : `${marcados.size} aparelhos selecionados`}
          </span>
          <select
            value={loja}
            onChange={(e) => setLoja(e.target.value)}
            className={campo}
          >
            <option value="">Definir loja…</option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
          <select
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            className={campo}
          >
            <option value="">Definir modelo…</option>
            {modelos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
          <button
            onClick={aplicar}
            disabled={pending}
            className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
          >
            {pending ? "Aplicando…" : "Aplicar"}
          </button>
          <button
            onClick={() => {
              setMarcados(new Set());
              setErro(null);
            }}
            className="text-xs text-muted hover:underline"
          >
            Limpar seleção
          </button>
          {erro && <span className="w-full text-xs text-danger">{erro}</span>}
          {/* Trocar de loja apaga a posição do aparelho, e quem está clicando
              precisa saber disso ANTES de clicar. */}
          {loja && (
            <span className="w-full text-xs text-muted">
              A posição dentro da loja é apagada — a antiga era de outro endereço.
            </span>
          )}
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface-2 text-left text-muted">
            <tr>
              {podeMexer && (
                <th className="w-10 px-4 py-2">
                  <input
                    type="checkbox"
                    checked={todosMarcados}
                    onChange={alternarTodos}
                    aria-label="Selecionar todos"
                    className="accent-primary"
                  />
                </th>
              )}
              <th className="px-4 py-2 font-medium">{t.fleet.colStatus}</th>
              <th className="px-4 py-2 font-medium">{t.fleet.colCode}</th>
              <th className="px-4 py-2 font-medium">{t.fleet.colName}</th>
              <th className="px-4 py-2 font-medium">{t.fleet.colModel}</th>
              <th className="px-4 py-2 font-medium">{t.fleet.colStore}</th>
              <th className="px-4 py-2 font-medium">{t.fleet.colMode}</th>
              <th className="px-4 py-2 font-medium">{t.fleet.colBattery}</th>
              <th className="px-4 py-2 font-medium">{t.fleet.colVersion}</th>
              <th className="px-4 py-2 font-medium">{t.fleet.colLastSeen}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {linhas.map((d) => (
              <tr
                key={d.id}
                className={marcados.has(d.id) ? "bg-primary/5" : "bg-surface"}
              >
                {podeMexer && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={marcados.has(d.id)}
                      onChange={() => alternar(d.id)}
                      aria-label={`Selecionar ${d.nome}`}
                      className="accent-primary"
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <StatusBadge status={d.status} />
                </td>
                <td className="px-4 py-3 text-muted">{d.codigo}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/frota/${d.id}`}
                    className="font-medium hover:text-primary hover:underline"
                  >
                    {d.nome}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">{d.modelo}</td>
                <td className="px-4 py-3 text-muted">
                  {d.lojaId ? (
                    <Link
                      href={`/lojas/${d.lojaId}`}
                      className="hover:text-primary hover:underline"
                    >
                      {d.lojaNome}
                    </Link>
                  ) : (
                    d.lojaNome
                  )}
                </td>
                <td className="px-4 py-3 text-muted">{d.modo}</td>
                <td className="px-4 py-3 text-muted">{d.bateria}</td>
                <td className="px-4 py-3 text-muted">{d.versao}</td>
                <td className="px-4 py-3 text-muted">{d.visto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
