"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { deleteCampaign, toggleCampaign } from "./actions";

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
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await toggleCampaign(id, !active);
            router.refresh();
          })
        }
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
          active
            ? "bg-success/15 text-success"
            : "border border-line text-muted hover:bg-surface-2"
        }`}
      >
        {active ? t.campaigns.active : t.campaigns.paused}
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
  );
}
