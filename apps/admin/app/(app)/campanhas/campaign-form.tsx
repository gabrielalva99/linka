"use client";

import Link from "next/link";
import { useActionState } from "react";
import { getMessages } from "@/lib/i18n";
import {
  CampaignFields,
  type CampaignDefaults,
  type Option,
} from "./campaign-fields";
import { createCampaign, updateCampaign, type CampaignState } from "./actions";

const initial: CampaignState = { status: "idle" };

/** Mesma tela para criar e editar; muda a ação e o rótulo do botão. */
export function CampaignForm({
  campaignId,
  media,
  chains,
  stores,
  models,
  devices,
  defaults,
}: {
  campaignId?: string;
  media: Option[];
  chains: Option[];
  stores: Option[];
  models: Option[];
  devices: Option[];
  defaults?: CampaignDefaults;
}) {
  const t = getMessages();
  const [state, action, pending] = useActionState(
    campaignId ? updateCampaign : createCampaign,
    initial,
  );

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      {campaignId && <input type="hidden" name="campaign_id" value={campaignId} />}
      <CampaignFields
        media={media}
        chains={chains}
        stores={stores}
        models={models}
        devices={devices}
        defaults={defaults}
      />

      {state.status === "error" && (
        <span className="text-sm text-danger">{t.campaigns.error}</span>
      )}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending
            ? t.campaigns.saving
            : campaignId
              ? t.campaigns.save
              : t.campaigns.create}
        </button>
        <Link href="/campanhas" className="text-sm text-muted hover:underline">
          {t.campaigns.back}
        </Link>
      </div>
    </form>
  );
}
