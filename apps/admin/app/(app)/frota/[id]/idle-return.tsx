"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { setIdleReturn } from "./actions";

/**
 * Quanto tempo o aparelho pode ficar fora da vitrine antes de voltar sozinho.
 * Fica no servidor: mudar de 30s para 60s não pode exigir novo APK em 250 aparelhos.
 */
export function IdleReturn({
  deviceId,
  seconds,
}: {
  deviceId: string;
  seconds: number;
}) {
  const t = getMessages();
  const router = useRouter();
  const [value, setValue] = useState(String(seconds));
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
      <span className="text-xs text-muted">{t.device.idleReturn}</span>
      <input
        type="number"
        min={5}
        max={3600}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        className="w-20 rounded-md border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-primary"
      />
      <span className="text-xs text-muted">{t.device.seconds}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await setIdleReturn(deviceId, Number(value));
            setSaved(true);
            router.refresh();
          })
        }
        className="rounded-md border border-line px-3 py-1 text-xs text-muted hover:bg-surface-2 disabled:opacity-60"
      >
        {t.device.save}
      </button>
      {saved && <span className="text-xs text-success">✓</span>}
      <span className="w-full text-xs text-muted">{t.device.idleReturnHint}</span>
    </div>
  );
}
