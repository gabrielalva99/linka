"use client";

import { useState } from "react";
import { CONTENT_FIT, CONTENT_FIT_LABELS } from "@linka/shared";
import { getMessages } from "@/lib/i18n";

const field =
  "rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

export type Option = { id: string; label: string };

export type PlaylistItem = { mediaId: string; fitMode: string };

export type CampaignDefaults = {
  name?: string;
  items?: PlaylistItem[];
  rotationMinutes?: number;
  scope?: string;
  targetId?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  startTime?: string | null;
  endTime?: string | null;
};

/** Campos da campanha — compartilhados entre criar e editar. */
export function CampaignFields({
  media,
  chains,
  stores,
  devices,
  defaults,
}: {
  media: Option[];
  chains: Option[];
  stores: Option[];
  devices: Option[];
  defaults?: CampaignDefaults;
}) {
  const t = getMessages();
  const [scope, setScope] = useState(defaults?.scope ?? "tenant");
  // Lista ordenada; a ordem dos campos no formulário é a ordem de exibição.
  const [items, setItems] = useState<PlaylistItem[]>(
    defaults?.items?.length ? defaults.items : [{ mediaId: "", fitMode: "" }],
  );

  const targets: Record<string, Option[]> = { chain: chains, store: stores, device: devices };
  const scopeOptions = [
    { key: "tenant", label: t.campaigns.scopeTenant },
    { key: "chain", label: t.campaigns.scopeChain },
    { key: "store", label: t.campaigns.scopeStore },
    { key: "device", label: t.campaigns.scopeDevice },
  ];

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[from], next[to]] = [next[to], next[from]];
    setItems(next);
  };

  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">{t.campaigns.name}</span>
        <input
          name="name"
          required
          defaultValue={defaults?.name ?? ""}
          className={field}
        />
      </label>

      {/* O QUÊ — playlist ordenada */}
      <fieldset className="rounded-xl border border-line p-4">
        <legend className="px-1 text-sm text-muted">{t.campaigns.playlist}</legend>
        <div className="flex flex-col gap-2">
          {items.map((item, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="w-5 shrink-0 text-xs text-muted">{i + 1}.</span>
              <select
                name="media_ids"
                required
                value={item.mediaId}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...next[i], mediaId: e.target.value };
                  setItems(next);
                }}
                className={`${field} min-w-0 flex-1`}
              >
                <option value="" disabled>
                  —
                </option>
                {media.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              {/* Enquadramento por vídeo: numa lista de 5, cada peça pede o seu. */}
              <select
                name="fit_modes"
                value={item.fitMode}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...next[i], fitMode: e.target.value };
                  setItems(next);
                }}
                className={`${field} shrink-0`}
              >
                <option value="">{t.campaigns.fitDefault}</option>
                {CONTENT_FIT.map((f) => (
                  <option key={f} value={f}>
                    {CONTENT_FIT_LABELS[f]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => move(i, i - 1)}
                disabled={i === 0}
                className="rounded-md border border-line px-2 py-1.5 text-xs text-muted disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, i + 1)}
                disabled={i === items.length - 1}
                className="rounded-md border border-line px-2 py-1.5 text-xs text-muted disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => setItems(items.filter((_, j) => j !== i))}
                disabled={items.length === 1}
                className="rounded-md border border-line px-2 py-1.5 text-xs text-muted hover:border-danger hover:text-danger disabled:opacity-30"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setItems([...items, { mediaId: "", fitMode: "" }])}
          className="mt-3 rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-surface-2"
        >
          + {t.campaigns.addVideo}
        </button>

        <label className="mt-4 flex items-center gap-2">
          <span className="text-xs text-muted">{t.campaigns.rotation}</span>
          <input
            type="number"
            name="rotation_minutes"
            min={1}
            max={1440}
            defaultValue={defaults?.rotationMinutes ?? 20}
            className={`${field} w-24`}
          />
          <span className="text-xs text-muted">{t.campaigns.minutes}</span>
        </label>
        <p className="mt-2 text-xs text-muted">{t.campaigns.rotationHint}</p>
      </fieldset>

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
            defaultValue={scope === defaults?.scope ? (defaults?.targetId ?? "") : ""}
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
            <input
              type="date"
              name="starts_on"
              defaultValue={defaults?.startsOn ?? ""}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t.campaigns.endsOn}</span>
            <input
              type="date"
              name="ends_on"
              defaultValue={defaults?.endsOn ?? ""}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t.campaigns.startTime}</span>
            <input
              type="time"
              name="start_time"
              defaultValue={defaults?.startTime ?? ""}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t.campaigns.endTime}</span>
            <input
              type="time"
              name="end_time"
              defaultValue={defaults?.endTime ?? ""}
              className={field}
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-muted">{t.campaigns.whenHint}</p>
        <p className="mt-1 text-xs text-muted">{t.campaigns.fallbackHint}</p>
      </fieldset>

    </>
  );
}
