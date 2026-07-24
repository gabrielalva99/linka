"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { deleteCampaign, toggleCampaign } from "./actions";

/**
 * Estado e ação separados de propósito: o selo "Ativa" antes era clicável e
 * pausava a campanha sem avisar — parecia informação, era um botão.
 */
export function CampaignActions({
  id,
  name,
  active,
}: {
  id: string;
  name: string;
  active: boolean;
}) {
  const t = getMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <span
        className={`rounded-full px-3 py-1 text-xs font-medium ${
          active ? "bg-success/15 text-success" : "bg-surface-2 text-muted"
        }`}
      >
        {active ? t.campaigns.active : t.campaigns.paused}
      </span>
      <div className="flex items-center gap-2">
        <Link
          href={`/campanhas/${id}`}
          className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-surface-2"
        >
          {t.campaigns.edit}
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await toggleCampaign(id, !active);
              router.refresh();
            })
          }
          className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-surface-2 disabled:opacity-60"
        >
          {active ? t.campaigns.pause : t.campaigns.resume}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm(t.campaigns.confirmDelete.replace("{name}", name))) return;
            startTransition(async () => {
              await deleteCampaign(id);
              router.refresh();
            });
          }}
          className="rounded-md border border-line px-3 py-1.5 text-xs text-muted transition hover:border-danger hover:text-danger"
        >
          {t.campaigns.delete}
        </button>
      </div>
    </div>
  );
}
