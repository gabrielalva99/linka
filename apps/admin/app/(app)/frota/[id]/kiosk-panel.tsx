"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { sendCommand, setBlockSettings } from "./actions";
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
  lockTaskOn,
  maintenanceOpen,
  pendingCommand,
  idleReturnSeconds,
  adbEnabled,
  lastCommandResult,
  blockSettings,
  blockedApps,
}: {
  deviceId: string;
  isDeviceOwner: boolean;
  kioskLocked: boolean;
  lockTaskOn: boolean | null;
  maintenanceOpen: boolean;
  pendingCommand: string | null;
  idleReturnSeconds: number;
  adbEnabled: boolean | null;
  lastCommandResult: string | null;
  blockSettings: boolean;
  blockedApps: string | null;
}) {
  const t = getMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // A ordem responde "o que eu preciso saber PRIMEIRO sobre este aparelho".
  //
  // Manutenção aberta vem na frente de tudo: é o único estado em que o aparelho
  // está solto de propósito, e quem olha a tela precisa saber disso antes de
  // concluir que a trava falhou.
  //
  // Depois vem a trava DE VERDADE (lock task). Antes esta faixa lia kioskLocked,
  // que mede outra coisa — as travas de rede — e ficava verde com o aparelho
  // aberto na mão de alguém. Nulo quando o agente é anterior a 0.42.0 e não
  // reporta: aí a faixa cai no que sabemos, sem inventar.
  const badge = !isDeviceOwner
    ? { text: t.device.kioskOff, cls: "bg-surface-2 text-muted" }
    : maintenanceOpen
      ? { text: "Liberado para manutenção agora", cls: "bg-warning/15 text-warning" }
      : lockTaskOn === false
        ? { text: "Fora do quiosque", cls: "bg-warning/15 text-warning" }
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

      {isDeviceOwner && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <span className="text-xs text-muted">{t.device.blockApps}</span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await setBlockSettings(deviceId, !blockSettings);
                router.refresh();
              })
            }
            className={`rounded-md px-3 py-1 text-xs font-medium ${
              blockSettings
                ? "bg-success/15 text-success"
                : "border border-line text-muted"
            }`}
          >
            {blockSettings ? t.device.blocked : t.device.notBlocked}
          </button>
          {blockedApps && (
            <span className="text-xs text-muted">({blockedApps})</span>
          )}
          <span className="w-full text-xs text-muted">{t.device.blockAppsHint}</span>
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
