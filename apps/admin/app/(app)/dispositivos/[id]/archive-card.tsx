"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { arquivarAparelho, desarquivarAparelho } from "./actions";
import { data } from "@/lib/datas";

const MOTIVOS = ["Roubado", "Quebrado", "Devolvido ao fabricante", "Trocado"];

/**
 * Tirar o aparelho de operação, ou trazer de volta.
 *
 * Fica no fim da ficha e sem destaque: é a ação mais rara da tela e a que mais
 * incomoda se for clicada por engano. O motivo é obrigatório porque "arquivado"
 * sem motivo, seis meses depois, não explica nada a ninguém — e é justamente aí
 * que alguém vai perguntar por que a frota tem 248 e não 250.
 */
export function ArchiveCard({
  deviceId,
  arquivado,
  motivo,
  desde,
}: {
  deviceId: string;
  arquivado: boolean;
  motivo: string | null;
  desde: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [abrindo, setAbrindo] = useState(false);
  const [escolhido, setEscolhido] = useState(MOTIVOS[0]);
  const [erro, setErro] = useState<string | null>(null);

  if (arquivado) {
    return (
      <section className="mt-8 rounded-xl border border-line bg-surface p-5">
        <p className="text-sm font-medium text-muted">Fora de operação</p>
        <p className="mt-1 text-sm">
          {motivo ?? "sem motivo registrado"}
          {desde && (
            <span className="text-muted">
              {" · desde "}
              {data(desde)}
            </span>
          )}
        </p>
        <p className="mt-2 text-xs text-muted">
          Não entra em relatório, não gera aviso e não conta na frota. O que ele
          mediu antes continua valendo.
        </p>
        <button
          onClick={() =>
            startTransition(async () => {
              const r = await desarquivarAparelho(deviceId);
              if (!r.ok) setErro(r.error);
              router.refresh();
            })
          }
          disabled={pending}
          className="mt-3 rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-surface-2 disabled:opacity-40"
        >
          {pending ? "Reativando…" : "Voltar para a operação"}
        </button>
        {erro && <p className="mt-2 text-xs text-danger">{erro}</p>}
      </section>
    );
  }

  return (
    <section className="mt-8">
      {abrindo ? (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-5">
          <p className="text-sm font-medium text-warning">
            Tirar este aparelho de operação
          </p>
          <p className="mt-1 text-xs text-muted">
            Ele para de aparecer na frota e para de gerar aviso de &quot;fora do
            ar&quot;. O histórico dele continua nos relatórios de quando estava na
            loja.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={escolhido}
              onChange={(e) => setEscolhido(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary"
            >
              {MOTIVOS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button
              onClick={() =>
                startTransition(async () => {
                  const r = await arquivarAparelho(deviceId, escolhido);
                  if (!r.ok) {
                    setErro(r.error);
                    return;
                  }
                  setAbrindo(false);
                  router.refresh();
                })
              }
              disabled={pending}
              className="rounded-md border border-warning/40 px-3 py-1.5 text-xs text-warning hover:bg-warning/10 disabled:opacity-40"
            >
              {pending ? "Arquivando…" : "Arquivar"}
            </button>
            <button
              onClick={() => {
                setAbrindo(false);
                setErro(null);
              }}
              className="text-xs text-muted hover:underline"
            >
              Cancelar
            </button>
          </div>
          {erro && <p className="mt-2 text-xs text-danger">{erro}</p>}
        </div>
      ) : (
        <button
          onClick={() => setAbrindo(true)}
          className="text-xs text-muted hover:text-warning hover:underline"
        >
          Tirar de operação (roubado, quebrado, devolvido)
        </button>
      )}
    </section>
  );
}
