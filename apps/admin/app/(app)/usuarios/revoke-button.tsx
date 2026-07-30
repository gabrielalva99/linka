"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { revokeAccess } from "./actions";

/** Tirar acesso pede confirmação: é o tipo de clique que ninguém desfaz sozinho. */
export function RevokeButton({
  userId,
  tenantId,
  nome,
}: {
  userId: string;
  tenantId: string;
  nome: string;
}) {
  const t = getMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  // Depois de remover, a linha some da lista — então o recado tem que aparecer
  // ANTES do refresh, e dizer qual dos dois casos aconteceu. "Removido" sozinho
  // deixava a dúvida que gerou o problema: a conta de login foi embora ou não?
  if (resultado) {
    return <span className="text-xs text-muted">{resultado}</span>;
  }

  if (confirmando) {
    return (
      <span className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted">
          {t.users.revokeConfirm.replace("{nome}", nome)}
        </span>
        <button
          onClick={() =>
            startTransition(async () => {
              const r = await revokeAccess(userId, tenantId);
              setConfirmando(false);
              if (!r.ok) {
                setErro(r.error);
                return;
              }
              setResultado(
                r.avisoContaPermanece
                  ? "Acesso removido, mas a conta de login continuou no sistema. Avise o suporte."
                  : r.contaApagada
                    ? "Removido. A conta de login também foi apagada."
                    : "Acesso a este cliente removido. A conta continua porque a pessoa acessa outro cliente.",
              );
              router.refresh();
            })
          }
          disabled={pending}
          className="rounded-md border border-warning/40 px-3 py-1.5 text-xs text-warning hover:bg-warning/10 disabled:opacity-40"
        >
          {pending ? t.users.revoking : t.users.confirm}
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center justify-end gap-2">
      {erro && <span className="text-xs text-warning">{erro}</span>}
      <button
        onClick={() => setConfirmando(true)}
        className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-surface-2"
      >
        {t.users.revoke}
      </button>
    </span>
  );
}
