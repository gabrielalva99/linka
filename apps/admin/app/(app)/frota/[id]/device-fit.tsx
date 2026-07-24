"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CONTENT_FIT, CONTENT_FIT_LABELS, type ContentFit } from "@linka/shared";
import { getMessages } from "@/lib/i18n";
import { setDeviceFit } from "./actions";

/**
 * Enquadramento deste aparelho. "Padrão do vídeo" devolve o controle ao arquivo
 * (uma decisão que vale para a frota toda); as outras opções valem só aqui.
 */
export function DeviceFit({
  deviceId,
  value,
  inherited,
}: {
  deviceId: string;
  value: ContentFit | null;
  inherited: ContentFit;
}) {
  const t = getMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const options: { key: ContentFit | null; label: string }[] = [
    { key: null, label: `${t.device.fitDefault} (${CONTENT_FIT_LABELS[inherited]})` },
    ...CONTENT_FIT.map((f) => ({ key: f as ContentFit | null, label: CONTENT_FIT_LABELS[f] })),
  ];

  return (
    <div className="inline-flex flex-wrap rounded-lg border border-line p-0.5">
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <button
            key={opt.key ?? "default"}
            type="button"
            disabled={pending || active}
            onClick={() =>
              startTransition(async () => {
                await setDeviceFit(deviceId, opt.key);
                router.refresh();
              })
            }
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted hover:bg-surface-2 disabled:opacity-60"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
