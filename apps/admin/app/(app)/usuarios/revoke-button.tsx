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
              if (!r.ok) setErro(r.error);
              setConfirmando(false);
              router.refresh();
            })
          }
          disabled={pending}
          className="rounded-md border border-warning/40 px-2 py-1 text-xs text-warning hover:bg-warning/10 disabled:opacity-40"
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
