"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CONTENT_FIT, CONTENT_FIT_LABELS } from "@linka/shared";
import { getMessages } from "@/lib/i18n";
import { createCampaign, type CampaignState } from "./actions";

const initial: CampaignState = { status: "idle" };
const field =
  "rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

export type Option = { id: string; label: string };

export function CampaignForm({
  media,
  chains,
  stores,
  devices,
}: {
  media: Option[];
  chains: Option[];
  stores: Option[];
  devices: Option[];
}) {
  const t = getMessages();
  const [state, action, pending] = useActionState(createCampaign, initial);
  const [scope, setScope] = useState("tenant");

  const targets: Record<string, Option[]> = { chain: chains, store: stores, device: devices };
  const scopeOptions = [
    { key: "tenant", label: t.campaigns.scopeTenant },
    { key: "chain", label: t.campaigns.scopeChain },
    { key: "store", label: t.campaigns.scopeStore },
    { key: "device", label: t.campaigns.scopeDevice },
  ];

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">{t.campaigns.name}</span>
        <input name="name" required className={field} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">{t.campaigns.media}</span>
        <select name="media_id" required defaultValue="" className={field}>
          <option value="" disabled>
            —
          </option>
          {media.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {/* ONDE */}
      <fieldset className="rounded-xl border border-line p-4">
        <legend className="px-1 text-sm text-muted">{t.campaigns.where}</legend>
        <div className="flex flex-wrap gap-2">
          {scopeOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setScope(opt.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                scope === opt.key
                  ? "bg-primary text-primary-foreground"
                  : "border border-line text-muted hover:bg-surface-2"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="scope" value={scope} />
        {scope !== "tenant" && (
          <select
            key={scope}
            name="target_id"
            required
            defaultValue=""
            className={`${field} mt-3 w-full`}
          >
            <option value="" disabled>
              —
            </option>
            {(targets[scope] ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        <p className="mt-3 text-xs text-muted">{t.campaigns.whereHint}</p>
      </fieldset>

      {/* QUANDO */}
      <fieldset className="rounded-xl border border-line p-4">
        <legend className="px-1 text-sm text-muted">{t.campaigns.when}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t.campaigns.startsOn}</span>
            <input type="date" name="starts_on" className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t.campaigns.endsOn}</span>
            <input type="date" name="ends_on" className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t.campaigns.startTime}</span>
            <input type="time" name="start_time" className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t.campaigns.endTime}</span>
            <input type="time" name="end_time" className={field} />
          </label>
        </div>
        <p className="mt-3 text-xs text-muted">{t.campaigns.whenHint}</p>
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">{t.campaigns.fit}</span>
        <select name="fit_mode" defaultValue="" className={field}>
          <option value="">{t.campaigns.fitDefault}</option>
          {CONTENT_FIT.map((f) => (
            <option key={f} value={f}>
              {CONTENT_FIT_LABELS[f]}
            </option>
          ))}
        </select>
      </label>

      {state.status === "error" && (
        <span className="text-sm text-danger">{t.campaigns.error}</span>
      )}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? t.campaigns.creating : t.campaigns.create}
        </button>
        <Link href="/campanhas" className="text-sm text-muted hover:underline">
          {t.campaigns.back}
        </Link>
      </div>
    </form>
  );
}
