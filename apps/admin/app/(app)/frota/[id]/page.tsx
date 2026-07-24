import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTenant } from "@/lib/tenant";
import { getMessages } from "@/lib/i18n";
import { DEVICE_MODE_LABELS, type DeviceMode } from "@linka/shared";
import { ContentManager } from "./content-manager";

type Rel = { name: string | null } | { name: string | null }[] | null;
const relName = (rel: Rel) =>
  (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "—";

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
      "id, code, name, status, mode, battery_level, battery_charging, os_version, agent_version, content_url, provisioning_code, device_models(name), stores(name)",
    )
    .eq("id", id)
    .single();
  if (!device) notFound();

  const [{ data: media }, tenant] = await Promise.all([
    supabase
      .from("media_assets")
      .select("id, name, url")
      .order("created_at", { ascending: false }),
    getActiveTenant(),
  ]);

  const t = getMessages();
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
    provisioning_code: string | null;
    device_models: Rel;
    stores: Rel;
  };

  const info: [string, string][] = [
    [t.device.code, d.code ?? "—"],
    [t.device.model, relName(d.device_models)],
    [t.device.store, relName(d.stores)],
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

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/frota" className="text-sm text-muted hover:underline">
        ← {t.device.back}
      </Link>
      <h1 className="mt-2 text-xl font-semibold">{d.name}</h1>

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
          <ContentManager
            deviceId={d.id}
            tenantId={tenant?.id ?? ""}
            currentUrl={d.content_url}
            media={(media ?? []) as { id: string; name: string; url: string }[]}
          />
        </div>
      </section>
    </div>
  );
}
