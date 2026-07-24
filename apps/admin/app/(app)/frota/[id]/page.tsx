import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTenant } from "@/lib/tenant";
import { getMessages } from "@/lib/i18n";
import {
  CONTENT_FIT_HINTS,
  DEVICE_MODE_LABELS,
  type ContentFit,
  type DeviceMode,
} from "@linka/shared";
import { AutoRefresh } from "../../auto-refresh";
import { FitToggle } from "../../biblioteca/fit-toggle";
import { ContentManager } from "./content-manager";

type Rel = { name: string | null } | { name: string | null }[] | null;
const relName = (rel: Rel) =>
  (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "—";

type Media = { id: string; name: string; url: string; fit_mode: ContentFit };

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
      "id, code, name, status, mode, battery_level, battery_charging, os_version, agent_version, content_url, playing_url, playing_fit, provisioning_code, hardware_model, device_models(name), stores(name), positions(label)",
    )
    .eq("id", id)
    .single();
  if (!device) notFound();

  const [{ data: mediaData }, tenant] = await Promise.all([
    supabase
      .from("media_assets")
      .select("id, name, url, fit_mode")
      .order("created_at", { ascending: false }),
    getActiveTenant(),
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
    playing_url: string | null;
    playing_fit: ContentFit | null;
    provisioning_code: string | null;
    hardware_model: string | null;
    device_models: Rel;
    stores: Rel;
    positions: { label: string | null } | { label: string | null }[] | null;
  };

  // O aparelho reporta o próprio modelo; o catálogo só refina o nome comercial.
  const catalogModel = relName(d.device_models);
  const modelLabel =
    catalogModel !== "—"
      ? catalogModel
      : d.hardware_model
        ? `${d.hardware_model} (${t.device.detected})`
        : "—";
  const positionLabel =
    (Array.isArray(d.positions) ? d.positions[0]?.label : d.positions?.label) ?? "—";

  const info: [string, string][] = [
    [t.device.code, d.code ?? "—"],
    [t.device.model, modelLabel],
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

  // Status do conteúdo: comparar o que foi mandado (arquivo + enquadramento) com o
  // que o aparelho confirma estar exibindo.
  const assignedUrl = d.content_url;
  const assigned = assignedUrl
    ? (media.find((m) => m.url === assignedUrl) ?? null)
    : null;
  const assignedName = assignedUrl
    ? (assigned?.name ??
      decodeURIComponent(assignedUrl.split("/").pop() ?? assignedUrl))
    : null;
  const fitOk = assigned == null || d.playing_fit === assigned.fit_mode;
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
        <h2 className="text-sm font-medium text-muted">{t.device.content}</h2>

        <div className="mt-3 rounded-xl border border-line bg-surface p-5">
          <div className="mb-5 flex items-center justify-between gap-3 border-b border-line pb-4">
            <div className="min-w-0">
              <p className="text-xs text-muted">{t.device.contentCurrent}</p>
              <p className="truncate text-sm font-medium">
                {assignedName ?? t.device.contentNone}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${badge.cls}`}
            >
              {badge.text}
            </span>
          </div>

          {assigned && (
            <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-line pb-5">
              <span className="text-xs text-muted">{t.device.fit}</span>
              <FitToggle
                mediaId={assigned.id}
                value={assigned.fit_mode}
                deviceId={d.id}
              />
              <span className="text-xs text-muted">
                {CONTENT_FIT_HINTS[assigned.fit_mode]}
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
