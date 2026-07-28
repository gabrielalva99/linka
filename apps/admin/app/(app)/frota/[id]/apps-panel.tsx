"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { refreshApps, uninstallApp } from "./actions";

export type DeviceApp = {
  package: string;
  label: string;
  version: string | null;
  is_system: boolean;
};

/**
 * O que está instalado neste aparelho.
 *
 * A pergunta que a tela responde não é "quantos apps tem", é "tem alguma coisa
 * aqui que não deveria". Por isso o que veio de fábrica fica recolhido por
 * padrão: são dezenas e nenhum deles é notícia. O que alguém instalou depois
 * são poucos e aparecem primeiro.
 */
export function AppsPanel({
  deviceId,
  apps,
  pendingCommand,
  podeOperar,
}: {
  deviceId: string;
  apps: DeviceApp[];
  pendingCommand: string | null;
  podeOperar: boolean;
}) {
  const t = getMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mostrarFabrica, setMostrarFabrica] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const instalados = apps.filter((a) => !a.is_system);
  const fabrica = apps.filter((a) => a.is_system);
  const removendo = pendingCommand?.startsWith("uninstall:")
    ? pendingCommand.slice("uninstall:".length)
    : null;

  function remover(pkg: string) {
    startTransition(async () => {
      await uninstallApp(deviceId, pkg);
      setConfirmando(null);
      router.refresh();
    });
  }

  const Linha = ({ a }: { a: DeviceApp }) => (
    <li className="flex items-center gap-3 border-b border-line py-2 last:border-0">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{a.label}</span>
        <span className="block truncate text-xs text-muted">
          {a.package}
          {a.version ? ` · ${a.version}` : ""}
        </span>
      </span>
      {removendo === a.package ? (
        <span className="shrink-0 text-xs text-warning">{t.device.appsRemoving}</span>
      ) : confirmando === a.package ? (
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted">
            {a.is_system ? t.device.appsHideHint : t.device.appsRemoveHint}
          </span>
          <button
            onClick={() => remover(a.package)}
            disabled={pending}
            className="rounded-md border border-warning/40 px-2 py-1 text-xs text-warning hover:bg-warning/10 disabled:opacity-40"
          >
            {t.device.appsConfirm}
          </button>
        </span>
      ) : podeOperar ? (
        <button
          onClick={() => setConfirmando(a.package)}
          className="shrink-0 rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-surface-2"
        >
          {a.is_system ? t.device.appsHide : t.device.appsRemove}
        </button>
      ) : null}
    </li>
  );

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted">{t.device.apps}</h2>
        {podeOperar && (
        <button
          onClick={() =>
            startTransition(async () => {
              await refreshApps(deviceId);
              router.refresh();
            })
          }
          disabled={pending}
          className="rounded-md border border-line px-3 py-1 text-xs text-muted hover:bg-surface-2 disabled:opacity-40"
        >
          {t.device.appsRefresh}
        </button>
        )}
      </div>

      <div className="mt-3 rounded-xl border border-line bg-surface p-5">
        {apps.length === 0 ? (
          <p className="text-sm text-muted">{t.device.appsEmpty}</p>
        ) : (
          <>
            <p className="text-xs text-muted">
              {t.device.appsInstalled.replace("{n}", String(instalados.length))}
            </p>
            {instalados.length > 0 ? (
              <ul className="mt-2">
                {instalados.map((a) => (
                  <Linha key={a.package} a={a} />
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-success">{t.device.appsClean}</p>
            )}

            <button
              onClick={() => setMostrarFabrica((v) => !v)}
              className="mt-5 text-xs text-muted hover:underline"
            >
              {mostrarFabrica
                ? t.device.appsHideFactory
                : t.device.appsShowFactory.replace("{n}", String(fabrica.length))}
            </button>
            {mostrarFabrica && (
              <ul className="mt-2">
                {fabrica.map((a) => (
                  <Linha key={a.package} a={a} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
