"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tentarAtualizarDeNovo } from "./actions";

/**
 * Botão de tentar a atualização de novo.
 *
 * Fica dentro do próprio aviso de "atualização travada", porque é ali que a
 * pessoa está olhando quando quer resolver. Antes o aviso só informava, e a
 * única saída era plugar o aparelho num notebook — o que numa loja a 40 km é
 * uma visita técnica por causa de um download.
 */
export function UpdateRetry({ deviceId }: { deviceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  if (enviado) {
    return (
      <span className="text-xs text-muted">
        Pedido enviado. O aparelho tenta na próxima batida, em até 1 minuto.
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        onClick={() =>
          startTransition(async () => {
            const r = await tentarAtualizarDeNovo(deviceId);
            if (!r.ok) setErro(r.error);
            else {
              setEnviado(true);
              router.refresh();
            }
          })
        }
        disabled={pending}
        className="rounded-md border border-warning/40 px-3 py-1.5 text-xs text-warning hover:bg-warning/10 disabled:opacity-40"
      >
        {pending ? "Enviando…" : "Tentar de novo"}
      </button>
      {erro && <span className="text-xs text-danger">{erro}</span>}
    </span>
  );
}
