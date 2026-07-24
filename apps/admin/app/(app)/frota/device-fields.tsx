"use client";

import Link from "next/link";
import { useState } from "react";
import { DEVICE_TYPE, DEVICE_TYPE_LABELS } from "@linka/shared";
import { getMessages } from "@/lib/i18n";

export type Option = { id: string; label: string };
export type PositionOption = Option & { storeId: string };

export type DeviceDefaults = {
  name?: string | null;
  code?: string | null;
  modelId?: string | null;
  storeId?: string | null;
  positionId?: string | null;
  platform?: string | null;
  deviceType?: string | null;
  imei?: string | null;
};

const field =
  "rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

/** Campos de cadastro do aparelho, compartilhados entre criar e editar. */
export function DeviceFields({
  models,
  stores,
  positions,
  defaults,
  detectedModel,
}: {
  models: Option[];
  stores: Option[];
  positions: PositionOption[];
  defaults?: DeviceDefaults;
  detectedModel?: string | null;
}) {
  const t = getMessages();
  // A posição pertence à loja: trocar de loja precisa trocar a lista.
  const [storeId, setStoreId] = useState(defaults?.storeId ?? "");
  const storePositions = positions.filter((p) => p.storeId === storeId);

  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">{t.deviceForm.name}</span>
        <input name="name" required defaultValue={defaults?.name ?? ""} className={field} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.deviceForm.code}</span>
          <input name="code" defaultValue={defaults?.code ?? ""} className={field} />
          <span className="text-xs text-muted">{t.deviceForm.codeAuto}</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.deviceForm.model}</span>
          <select
            name="model_id"
            defaultValue={defaults?.modelId ?? ""}
            className={field}
          >
            <option value="">—</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          {detectedModel && (
            <span className="text-xs text-muted">
              {t.deviceForm.detected}: {detectedModel}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.deviceForm.store}</span>
          {/* Não controlado de propósito: o valor vem do próprio campo, então nenhum
              estado do React pode "esquecer" a loja e salvar vazio por cima. */}
          <select
            name="store_id"
            defaultValue={defaults?.storeId ?? ""}
            onChange={(e) => setStoreId(e.target.value)}
            className={field}
          >
            <option value="">—</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {/* A lista só tem lojas cadastradas — sem atalho, parece que o campo travou. */}
          <span className="text-xs text-muted">
            {t.deviceForm.storeMissing}{" "}
            <Link href="/lojas/nova" className="text-primary underline">
              {t.deviceForm.createStore}
            </Link>
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.deviceForm.position}</span>
          <select
            key={storeId}
            name="position_id"
            defaultValue={defaults?.positionId ?? ""}
            disabled={storePositions.length === 0}
            className={field}
          >
            <option value="">—</option>
            {storePositions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {storeId && storePositions.length === 0 && (
            <span className="text-xs text-muted">
              {t.deviceForm.noPositions}{" "}
              <Link href={`/lojas/${storeId}`} className="text-primary underline">
                {t.deviceForm.createPositions}
              </Link>
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.deviceForm.type}</span>
          <select
            name="device_type"
            defaultValue={defaults?.deviceType ?? "smartphone"}
            className={field}
          >
            {DEVICE_TYPE.map((ty) => (
              <option key={ty} value={ty}>
                {DEVICE_TYPE_LABELS[ty]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.deviceForm.platform}</span>
          <select
            name="platform"
            defaultValue={defaults?.platform ?? "android"}
            className={field}
          >
            <option value="android">Android</option>
            <option value="ios">iOS</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.deviceForm.imei}</span>
          <input name="imei" defaultValue={defaults?.imei ?? ""} className={field} />
        </label>
      </div>
    </>
  );
}
