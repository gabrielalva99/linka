"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CONTENT_FIT, CONTENT_FIT_LABELS, type ContentFit } from "@linka/shared";
import { setMediaFit } from "./actions";

/** Alterna entre preencher a tela (corta) e mostrar o vídeo inteiro (barras). */
export function FitToggle({
  mediaId,
  value,
  deviceId,
}: {
  mediaId: string;
  value: ContentFit;
  deviceId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="inline-flex rounded-lg border border-line p-0.5">
      {CONTENT_FIT.map((fit) => {
        const active = fit === value;
        return (
          <button
            key={fit}
            type="button"
            disabled={pending || active}
            onClick={() =>
              startTransition(async () => {
                await setMediaFit(mediaId, fit, deviceId);
                router.refresh();
              })
            }
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted hover:bg-surface-2 disabled:opacity-60"
            }`}
          >
            {CONTENT_FIT_LABELS[fit]}
          </button>
        );
      })}
    </div>
  );
}
