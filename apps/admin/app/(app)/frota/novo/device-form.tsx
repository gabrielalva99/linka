"use client";

import Link from "next/link";
import { useActionState } from "react";
import { getMessages } from "@/lib/i18n";
import { createDevice, type CreateDeviceState } from "./actions";

const initial: CreateDeviceState = { status: "idle" };
const field =
  "rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

type Option = { id: string; label: string };

export function DeviceForm({
  models,
  stores,
}: {
  models: Option[];
  stores: Option[];
}) {
  const t = getMessages();
  const [state, action, pending] = useActionState(createDevice, initial);

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">{t.deviceForm.name}</span>
        <input name="name" required className={field} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.deviceForm.code}</span>
          <input name="code" className={field} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.deviceForm.model}</span>
          <select name="model_id" defaultValue="" className={field}>
            <option value="">—</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.deviceForm.store}</span>
          <select name="store_id" defaultValue="" className={field}>
            <option value="">—</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.deviceForm.platform}</span>
          <select name="platform" defaultValue="android" className={field}>
            <option value="android">Android</option>
            <option value="ios">iOS</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.deviceForm.imei}</span>
          <input name="imei" className={field} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.deviceForm.os}</span>
          <input name="os_version" placeholder="16" className={field} />
        </label>
      </div>

      {state.status === "dup" && (
        <span className="text-sm text-danger">{t.deviceForm.dup}</span>
      )}
      {state.status === "error" && (
        <span className="text-sm text-danger">{t.deviceForm.error}</span>
      )}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? t.deviceForm.creating : t.deviceForm.create}
        </button>
        <Link href="/frota" className="text-sm text-muted hover:underline">
          {t.deviceForm.back}
        </Link>
      </div>
    </form>
  );
}
