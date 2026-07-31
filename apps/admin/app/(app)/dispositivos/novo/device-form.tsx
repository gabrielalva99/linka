"use client";

import Link from "next/link";
import { useActionState } from "react";
import { getMessages } from "@/lib/i18n";
import {
  DeviceFields,
  type Option,
  type PositionOption,
} from "../device-fields";
import { createDevice, type CreateDeviceState } from "./actions";

const initial: CreateDeviceState = { status: "idle" };

export function DeviceForm({
  models,
  stores,
  positions,
}: {
  models: Option[];
  stores: Option[];
  positions: PositionOption[];
}) {
  const t = getMessages();
  const [state, action, pending] = useActionState(createDevice, initial);

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <DeviceFields models={models} stores={stores} positions={positions} />

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
        <Link href="/dispositivos" className="text-sm text-muted hover:underline">
          {t.deviceForm.back}
        </Link>
      </div>
    </form>
  );
}
