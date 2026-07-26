"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { sendCommand } from "./actions";
import { IdleReturn } from "./idle-return";

/**
 * Estado do bloqueio e a chave de saída. "Dono do aparelho" só se desfaz pelo
 * próprio app ou por reset de fábrica — por isso o botão de desprovisionar existe
 * desde o primeiro aparelho travado, não depois.
 */
export function KioskPanel({
  deviceId,
  isDeviceOwner,
  kioskLocked,
  pendingCommand,
  idleReturnSeconds,
  adbEnabled,
  lastCommandResult,
}: {
  deviceId: string;
  isDeviceOwner: boolean;
  kioskLocked: boolean;
  pendingCommand: string | null;
  idleReturnSeconds: number;
  adbEnabled: boolean | null;
  lastCommandResult: string | null;
}) {
  const t = getMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const badge = !isDeviceOwner
    ? { text: t.device.kioskOff, cls: "bg-surface-2 text-muted" }
    : kioskLocked
      ? { text: t.device.kioskLocked, cls: "bg-success/15 text-success" }
      : { text: t.device.kioskPartial, cls: "bg-warning/15 text-warning" };

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${badge.cls}`}
          >
            {badge.text}
          </span>
          <p className="mt-2 text-xs text-muted">
            {isDeviceOwner ? t.device.kioskHintOn : t.device.kioskHintOff}
          </p>
        </div>

        {isDeviceOwner && (
          <button
            type="button"
            disabled={pending || pendingCommand === "deprovision"}
            onClick={() => {
              if (!confirm(t.device.confirmDeprovision)) return;
              startTransition(async () => {
                await sendCommand(deviceId, "deprovision");
                router.refresh();
              });
            }}
            className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs text-muted transition hover:border-danger hover:text-danger disabled:opacity-60"
          >
            {pendingCommand === "deprovision"
              ? t.device.deprovisioning
              : t.device.deprovision}
          </button>
        )}
      </div>

      {isDeviceOwner && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <span className="text-xs text-muted">{t.device.usbDebug}</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs ${
              adbEnabled ? "bg-warning/15 text-warning" : "bg-surface-2 text-muted"
            }`}
          >
            {adbEnabled === null
              ? "—"
              : adbEnabled
                ? t.device.usbDebugOn
                : t.device.usbDebugOff}
          </span>
          <button
            type="button"
            disabled={pending || pendingCommand != null}
            onClick={() =>
              startTransition(async () => {
                await sendCommand(deviceId, adbEnabled ? "debug_off" : "debug_on");
                router.refresh();
              })
            }
            className="rounded-md border border-line px-3 py-1 text-xs text-muted hover:bg-surface-2 disabled:opacity-60"
          >
            {adbEnabled ? t.device.usbDebugDisable : t.device.usbDebugEnable}
          </button>
          <span className="w-full text-xs text-muted">{t.device.usbDebugHint}</span>
        </div>
      )}

      {lastCommandResult && (
        <p className="mt-3 text-xs text-muted">
          {t.device.lastCommand}: {lastCommandResult}
        </p>
      )}

      <IdleReturn deviceId={deviceId} seconds={idleReturnSeconds} />
    </div>
  );
}
