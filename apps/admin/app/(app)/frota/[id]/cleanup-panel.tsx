"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { sendCommand, setCleanup } from "./actions";

/**
 * Faxina diária: horário, liga/desliga e o relato da última limpeza.
 * O relato fica visível porque "limpou" é afirmação sobre 250 aparelhos que
 * ninguém vai conferir na mão.
 */
export function CleanupPanel({
  deviceId,
  enabled,
  time,
  lastAt,
  lastResult,
  pendingCommand,
}: {
  deviceId: string;
  enabled: boolean;
  time: string;
  lastAt: string | null;
  lastResult: string | null;
  pendingCommand: string | null;
}) {
  const t = getMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(time.slice(0, 5));

  const save = (nextEnabled: boolean, nextTime: string) =>
    startTransition(async () => {
      await setCleanup(deviceId, nextEnabled, nextTime);
      router.refresh();
    });

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">{t.device.cleanupEvery}</span>
        <input
          type="time"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => value !== time.slice(0, 5) && save(enabled, value)}
          className="rounded-md border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => save(!enabled, value)}
          className={`rounded-md px-3 py-1 text-xs font-medium ${
            enabled ? "bg-success/15 text-success" : "border border-line text-muted"
          }`}
        >
          {enabled ? t.device.cleanupOn : t.device.cleanupOff}
        </button>
        <button
          type="button"
          disabled={pending || pendingCommand != null}
          onClick={() =>
            startTransition(async () => {
              await sendCommand(deviceId, "cleanup_now");
              router.refresh();
            })
          }
          className="rounded-md border border-line px-3 py-1 text-xs text-muted hover:bg-surface-2 disabled:opacity-60"
        >
          {pendingCommand === "cleanup_now"
            ? t.device.cleaningNow
            : t.device.cleanNow}
        </button>
      </div>

      <p className="mt-3 text-xs text-muted">{t.device.cleanupHint}</p>

      {lastResult && (
        <p
          className={`mt-2 text-xs ${
            lastResult.includes("SEM PERMISSÃO") ? "text-warning" : "text-muted"
          }`}
        >
          {t.device.cleanupLast}
          {lastAt ? ` (${new Date(lastAt).toLocaleString("pt-BR")})` : ""}: {lastResult}
        </p>
      )}
    </div>
  );
}
