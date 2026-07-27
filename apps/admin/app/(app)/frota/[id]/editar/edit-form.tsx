"use client";

import Link from "next/link";
import { useActionState } from "react";
import { getMessages } from "@/lib/i18n";
import {
  DeviceFields,
  type DeviceDefaults,
  type Option,
  type PositionOption,
} from "../../device-fields";
import { updateDevice, type EditDeviceState } from "./actions";

const initial: EditDeviceState = { status: "idle" };

export function EditDeviceForm({
  deviceId,
  models,
  stores,
  positions,
  defaults,
  detectedModel,
}: {
  deviceId: string;
  models: Option[];
  stores: Option[];
  positions: PositionOption[];
  defaults: DeviceDefaults;
  detectedModel: string | null;
}) {
  const t = getMessages();
  const [state, action, pending] = useActionState(updateDevice, initial);

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="device_id" value={deviceId} />
      <DeviceFields
        models={models}
        stores={stores}
        positions={positions}
        defaults={defaults}
        detectedModel={detectedModel}
      />

      {/* Fica no cadastro, não num painel escondido: quem move um aparelho da
          bancada para a loja é quem precisa lembrar de tirar essa marca. */}
      <label className="flex items-start gap-3 rounded-lg border border-line bg-surface-2 p-4">
        <input
          type="checkbox"
          name="exclude_from_reports"
          defaultChecked={defaults.excludeFromReports}
          className="mt-0.5"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm">{t.deviceForm.testDevice}</span>
          <span className="text-xs text-muted">{t.deviceForm.testDeviceHint}</span>
        </span>
      </label>

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
          {pending ? t.deviceForm.saving : t.deviceForm.save}
        </button>
        <Link
          href={`/frota/${deviceId}`}
          className="text-sm text-muted hover:underline"
        >
          {t.deviceForm.back}
        </Link>
      </div>
    </form>
  );
}
