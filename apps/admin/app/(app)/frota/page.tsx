import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import {
  DEVICE_MODE_LABELS,
  DEVICE_TYPE,
  type DeviceMode,
  type DeviceStatus,
  type DeviceType,
} from "@linka/shared";
import { StatusBadge } from "./status-badge";
import { TypeTabs } from "./type-tabs";

type Rel = { name: string | null } | { name: string | null }[] | null;
type DeviceRow = {
  id: string;
  code: string | null;
  name: string;
  status: DeviceStatus;
  mode: DeviceMode | null;
  battery_level: number | null;
  battery_charging: boolean | null;
  synced: boolean;
  app_updated: boolean;
  agent_version: string | null;
  last_seen_at: string | null;
  device_type: DeviceType;
  device_models: Rel;
  stores: Rel;
};

const relName = (rel: Rel) =>
  (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "—";

// Um aparelho que parou de reportar não envia "offline" — ele só some. Então o status
// honesto é derivado do último contato: sem sinal há > 3 min = fora do ar.
const STALE_MS = 3 * 60 * 1000;
function effectiveStatus(status: DeviceStatus, lastSeen: string | null): DeviceStatus {
  if (!lastSeen) return status;
  const age = Date.now() - new Date(lastSeen).getTime();
  if (age > STALE_MS) return "offline";
  return status;
}

function relativeLastSeen(ts: string | null): string {
  if (!ts) return "—";
  const min = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function Kpi({ label, value, total }: { label: string; value: number; total: number }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-sm font-medium text-muted">{label}</h2>
      <p className="mt-1 text-2xl font-semibold">
        {value}
        <span className="text-base font-normal text-muted"> / {total}</span>
      </p>
    </section>
  );
}

export default async function FrotaPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  const activeType = (DEVICE_TYPE as readonly string[]).includes(tipo ?? "")
    ? (tipo as DeviceType)
    : null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("devices")
    .select(
      "id, code, name, status, mode, battery_level, battery_charging, synced, app_updated, agent_version, last_seen_at, device_type, device_models(name), stores(name)",
    )
    .order("code", { ascending: true });
  const t = getMessages();
  const all = (data ?? []) as DeviceRow[];

  // Contagem por tipo sai da lista completa; as abas não podem depender do filtro.
  const counts: Record<string, number> = {};
  for (const d of all) counts[d.device_type] = (counts[d.device_type] ?? 0) + 1;

  const devices = activeType
    ? all.filter((d) => d.device_type === activeType)
    : all;

  const total = devices.length;
  const online = devices.filter(
    (d) => effectiveStatus(d.status, d.last_seen_at) === "online",
  ).length;
  const synced = devices.filter((d) => d.synced).length;
  const updated = devices.filter((d) => d.app_updated).length;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t.fleet.title}</h1>
        <div className="flex items-center gap-3">
          <Link href="/frota/modelos" className="text-sm text-muted hover:underline">
            {t.models.manage}
          </Link>
          <Link
            href="/frota/novo"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            {t.deviceForm.new}
          </Link>
        </div>
      </div>

      <TypeTabs active={activeType} counts={counts} />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Kpi label={t.fleet.active} value={online} total={total} />
        <Kpi label={t.fleet.synced} value={synced} total={total} />
        <Kpi label={t.fleet.updated} value={updated} total={total} />
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-line">
        {devices.length > 0 ? (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{t.fleet.colStatus}</th>
                <th className="px-4 py-2 font-medium">{t.fleet.colCode}</th>
                <th className="px-4 py-2 font-medium">{t.fleet.colName}</th>
                <th className="px-4 py-2 font-medium">{t.fleet.colModel}</th>
                <th className="px-4 py-2 font-medium">{t.fleet.colStore}</th>
                <th className="px-4 py-2 font-medium">{t.fleet.colMode}</th>
                <th className="px-4 py-2 font-medium">{t.fleet.colBattery}</th>
                <th className="px-4 py-2 font-medium">{t.fleet.colVersion}</th>
                <th className="px-4 py-2 font-medium">{t.fleet.colLastSeen}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {devices.map((d) => (
                <tr key={d.id} className="bg-surface">
                  <td className="px-4 py-3">
                    <StatusBadge status={effectiveStatus(d.status, d.last_seen_at)} />
                  </td>
                  <td className="px-4 py-3 text-muted">{d.code ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/frota/${d.id}`}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {d.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{relName(d.device_models)}</td>
                  <td className="px-4 py-3 text-muted">{relName(d.stores)}</td>
                  <td className="px-4 py-3 text-muted">
                    {d.mode ? DEVICE_MODE_LABELS[d.mode] : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {d.battery_level != null ? `${d.battery_level}%` : "—"}
                    {d.battery_charging ? " ⚡" : ""}
                  </td>
                  <td className="px-4 py-3 text-muted">{d.agent_version ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    {relativeLastSeen(d.last_seen_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="bg-surface px-4 py-8 text-center text-sm text-muted">
            {t.fleet.empty}
          </p>
        )}
      </div>
    </div>
  );
}
