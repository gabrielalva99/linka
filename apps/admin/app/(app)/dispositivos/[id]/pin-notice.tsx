"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { unpinContent } from "./actions";

/**
 * Um vídeo fixado vence qualquer campanha. Sem este aviso, a campanha parece
 * "não funcionar" e ninguém descobre o porquê olhando a tela.
 */
export function PinNotice({ deviceId }: { deviceId: string }) {
  const t = getMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
      <span className="text-xs text-warning">{t.device.pinnedWarning}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await unpinContent(deviceId);
            router.refresh();
          })
        }
        className="shrink-0 rounded-md border border-warning/40 px-3 py-1.5 text-xs font-medium text-warning hover:bg-warning/10 disabled:opacity-60"
      >
        {t.device.unpin}
      </button>
    </div>
  );
}
