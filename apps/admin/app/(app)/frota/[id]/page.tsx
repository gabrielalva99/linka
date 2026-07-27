import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTenant } from "@/lib/tenant";
import { getMessages } from "@/lib/i18n";
import { modelLabel } from "@/lib/device-display";
import {
  CONTENT_FIT_HINTS,
  DEVICE_MODE_LABELS,
  type ContentFit,
  type DeviceMode,
} from "@linka/shared";
import { AutoRefresh } from "../../auto-refresh";
import { ContentManager } from "./content-manager";
import { DeviceFit } from "./device-fit";
import { CleanupPanel } from "./cleanup-panel";
import { KioskPanel } from "./kiosk-panel";
import { JourneyPanel, type Journey } from "./journey-panel";
import { PinNotice } from "./pin-notice";

type Rel = { name: string | null } | { name: string | null }[] | null;
const relName = (rel: Rel) =>
  (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "—";

type Media = { id: string; name: string; url: string; fit_mode: ContentFit };

/** "3h51" / "2d 4h" — reinício sozinho aparece como tempo baixo demais. */
function humanUptime(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h < 24) return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** dBm é ilegível para quem opera loja: traduz para palavra. */
function signalLabel(dbm: number | null): string {
  if (dbm == null) return "—";
  const quality =
    dbm >= -60 ? "ótimo" : dbm >= -70 ? "bom" : dbm >= -80 ? "fraco" : "ruim";
  return `${quality} (${dbm} dBm)`;
}

const CONNECTION_LABELS: Record<string, string> = {
  wifi: "Wi-Fi",
  cellular: "Chip / 5G",
  ethernet: "Cabo",
  none: "Sem rede",
};

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: device } = await supabase
    .from("devices")
    .select(
      "id, code, name, status, mode, battery_level, battery_charging, os_version, agent_version, content_url, content_fit, playing_url, playing_fit, provisioning_code, hardware_model, temperature_c, uptime_seconds, screen_on, connection, signal_dbm, is_device_owner, kiosk_locked, pending_command, idle_return_seconds, adb_enabled, last_command_result, cleanup_enabled, cleanup_time, last_cleanup_at, last_cleanup_result, update_error, block_settings, blocked_apps, exclude_from_reports, device_models(name), stores(name), positions(label)",
    )
    .eq("id", id)
    .single();
  if (!device) notFound();

  const [{ data: mediaData }, tenant, { data: resolvedRows }, { data: journeyData }] =
    await Promise.all([
      supabase
        .from("media_assets")
        .select("id, name, url, fit_mode")
        .order("created_at", { ascending: false }),
      getActiveTenant(),
      // Quem decide o que toca é o banco (fixo no aparelho > campanha mais específica).
      supabase.rpc("resolve_device_content", { p_device_id: id }),
      // O dia é o da loja: em fuso do servidor, loja fora de SP teria o
      // expediente cortado no meio.
      supabase.rpc("device_journey", { p_device_id: id }),
    ]);

  const t = getMessages();
  const media = (mediaData ?? []) as Media[];
  const d = device as {
    id: string;
    code: string | null;
    name: string;
    mode: DeviceMode | null;
    battery_level: number | null;
    battery_charging: boolean | null;
    os_version: string | null;
    agent_version: string | null;
    content_url: string | null;
    content_fit: ContentFit | null;
    playing_url: string | null;
    playing_fit: ContentFit | null;
    provisioning_code: string | null;
    hardware_model: string | null;
    temperature_c: number | string | null;
    uptime_seconds: number | null;
    screen_on: boolean | null;
    connection: string | null;
    signal_dbm: number | null;
    is_device_owner: boolean;
    kiosk_locked: boolean;
    pending_command: string | null;
    idle_return_seconds: number;
    adb_enabled: boolean | null;
    last_command_result: string | null;
    cleanup_enabled: boolean;
    cleanup_time: string;
    last_cleanup_at: string | null;
    last_cleanup_result: string | null;
    update_error: string | null;
    block_settings: boolean;
    blocked_apps: string | null;
    exclude_from_reports: boolean;
    device_models: Rel;
    stores: Rel;
    positions: { label: string | null } | { label: string | null }[] | null;
  };

  // O aparelho reporta o próprio modelo; o catálogo só refina o nome comercial.
  const model = modelLabel(relName(d.device_models), d.hardware_model, t.device.detected);
  const positionLabel =
    (Array.isArray(d.positions) ? d.positions[0]?.label : d.positions?.label) ?? "—";

  const info: [string, string][] = [
    [t.device.code, d.code ?? "—"],
    [t.device.model, model],
    [t.device.store, relName(d.stores)],
    [t.device.position, positionLabel],
    [t.device.mode, d.mode ? DEVICE_MODE_LABELS[d.mode] : "—"],
    [
      t.device.battery,
      d.battery_level != null
        ? `${d.battery_level}%${d.battery_charging ? " ⚡" : ""}`
        : "—",
    ],
    [t.device.os, d.os_version ?? "—"],
    [t.device.version, d.agent_version ?? "—"],
    [t.device.pairing, d.provisioning_code ?? "—"],
  ];

  // Saúde: a resposta para "por que essa loja não está no ar?".
  const temp = d.temperature_c != null ? Number(d.temperature_c) : null;
  const health: [string, string][] = [
    [
      t.device.temperature,
      temp != null ? `${temp.toFixed(1)} °C${temp >= 40 ? " ⚠️" : ""}` : "—",
    ],
    [t.device.uptime, humanUptime(d.uptime_seconds)],
    [
      t.device.screen,
      d.screen_on == null ? "—" : d.screen_on ? t.device.screenOn : t.device.screenOff,
    ],
    [
      t.device.connection,
      d.connection ? (CONNECTION_LABELS[d.connection] ?? d.connection) : "—",
    ],
    [t.device.signal, signalLabel(d.signal_dbm)],
  ];

  // O que este aparelho DEVE exibir agora, já com a precedência resolvida.
  const resolved = (
    Array.isArray(resolvedRows) ? resolvedRows[0] : null
  ) as {
    out_url: string | null;
    out_fit: ContentFit | null;
    out_source: string | null;
    out_campaign_name: string | null;
  } | null;

  const assignedUrl = resolved?.out_url ?? null;
  const assigned = assignedUrl
    ? (media.find((m) => m.url === assignedUrl) ?? null)
    : null;
  const assignedName = assignedUrl
    ? (assigned?.name ??
      decodeURIComponent(assignedUrl.split("/").pop() ?? assignedUrl))
    : null;
  const inheritedFit = assigned?.fit_mode ?? "zoom";
  const effectiveFit = resolved?.out_fit ?? d.content_fit ?? inheritedFit;
  const sourceLabel =
    resolved?.out_source === "campaign"
      ? `${t.device.fromCampaign}: ${resolved.out_campaign_name}`
      : resolved?.out_source === "device"
        ? t.device.fromDevice
        : null;

  const fitOk = assignedUrl == null || d.playing_fit === effectiveFit;
  const isLive = assignedUrl != null && d.playing_url === assignedUrl && fitOk;

  const badge = !assignedUrl
    ? { text: t.device.contentNone, cls: "bg-surface-2 text-muted" }
    : isLive
      ? { text: t.device.contentLive, cls: "bg-success/15 text-success" }
      : { text: t.device.contentPending, cls: "bg-warning/15 text-warning" };

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/frota" className="text-sm text-muted hover:underline">
        ← {t.device.back}
      </Link>
      <div className="mt-2 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{d.name}</h1>
        <Link
          href={`/frota/${d.id}/editar`}
          className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-surface-2"
        >
          {t.device.edit}
        </Link>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {info.map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-surface p-4">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="mt-1 text-sm">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-muted">{t.device.health}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {health.map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line bg-surface p-4">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="mt-1 text-sm">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {d.update_error && (
        <p className="mt-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-xs text-warning">
          {t.device.updateBlocked}: {d.update_error}
        </p>
      )}

      <JourneyPanel
        journey={(journeyData as Journey | null) ?? null}
        excluded={d.exclude_from_reports}
      />

      <section className="mt-8">
        <h2 className="text-sm font-medium text-muted">{t.device.kiosk}</h2>
        <KioskPanel
          deviceId={d.id}
          isDeviceOwner={d.is_device_owner}
          kioskLocked={d.kiosk_locked}
          pendingCommand={d.pending_command}
          idleReturnSeconds={d.idle_return_seconds}
          adbEnabled={d.adb_enabled}
          lastCommandResult={d.last_command_result}
          blockSettings={d.block_settings}
          blockedApps={d.blocked_apps}
        />
        <CleanupPanel
          deviceId={d.id}
          enabled={d.cleanup_enabled}
          time={d.cleanup_time}
          lastAt={d.last_cleanup_at}
          lastResult={d.last_cleanup_result}
          pendingCommand={d.pending_command}
        />
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-muted">{t.device.content}</h2>

        <div className="mt-3 rounded-xl border border-line bg-surface p-5">
          {d.content_url && <PinNotice deviceId={d.id} />}

          <div className="mb-5 flex items-center justify-between gap-3 border-b border-line pb-4">
            <div className="min-w-0">
              <p className="text-xs text-muted">{t.device.contentCurrent}</p>
              <p className="truncate text-sm font-medium">
                {assignedName ?? t.device.contentNone}
              </p>
              {sourceLabel && (
                <p className="mt-0.5 truncate text-xs text-muted">{sourceLabel}</p>
              )}
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${badge.cls}`}
            >
              {badge.text}
            </span>
          </div>

          {!assignedUrl && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
              <span className="text-xs text-warning">{t.device.noContentWarning}</span>
              <Link
                href="/campanhas/nova"
                className="shrink-0 rounded-md border border-warning/40 px-3 py-1.5 text-xs font-medium text-warning hover:bg-warning/10"
              >
                {t.device.createCampaign}
              </Link>
            </div>
          )}

          {assigned && (
            <div className="mb-5 flex flex-col gap-2 border-b border-line pb-5">
              <span className="text-xs text-muted">{t.device.fit}</span>
              <DeviceFit
                deviceId={d.id}
                value={d.content_fit}
                inherited={inheritedFit}
              />
              <span className="text-xs text-muted">
                {CONTENT_FIT_HINTS[effectiveFit]}
              </span>
            </div>
          )}

          <ContentManager
            deviceId={d.id}
            tenantId={tenant?.id ?? ""}
            currentUrl={d.content_url}
            media={media}
          />
        </div>
      </section>

      <AutoRefresh ms={5000} />
    </div>
  );
}
