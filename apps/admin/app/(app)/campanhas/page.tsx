import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { CONTENT_FIT_LABELS, type ContentFit } from "@linka/shared";
import { CampaignActions } from "./campaign-row";

type Rel = { name: string | null } | { name: string | null }[] | null;
const relName = (rel: Rel) => (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "—";

type Target = {
  scope: "tenant" | "chain" | "store" | "device";
  retail_chains: Rel;
  stores: Rel;
  devices: Rel;
};

type CampaignRow = {
  id: string;
  name: string;
  is_active: boolean;
  fit_mode: ContentFit | null;
  starts_on: string | null;
  ends_on: string | null;
  start_time: string | null;
  end_time: string | null;
  rotation_seconds: number;
  campaign_items: { position: number; media_assets: Rel }[];
  campaign_targets: Target[];
};

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export default async function CampanhasPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("campaigns")
    .select(
      "id, name, is_active, fit_mode, starts_on, ends_on, start_time, end_time, rotation_seconds, campaign_items(position, media_assets(name)), campaign_targets(scope, retail_chains(name), stores(name), devices(name))",
    )
    .order("created_at", { ascending: false });

  const t = getMessages();
  const campaigns = (data ?? []) as CampaignRow[];

  function whereLabel(target: Target | undefined): string {
    if (!target) return "—";
    if (target.scope === "tenant") return t.campaigns.scopeTenant;
    if (target.scope === "chain") return `${t.campaigns.scopeChain}: ${relName(target.retail_chains)}`;
    if (target.scope === "store") return `${t.campaigns.scopeStore}: ${relName(target.stores)}`;
    return `${t.campaigns.scopeDevice}: ${relName(target.devices)}`;
  }

  /** "1. abertura.mp4 → 2. copa.mp4 · troca a cada 20 min" */
  function playlistLabel(c: CampaignRow): string {
    const items = (c.campaign_items ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((i) => relName(i.media_assets));
    if (items.length === 0) return "—";
    const names = items.map((n, i) => `${i + 1}. ${n}`).join("  →  ");
    if (items.length === 1) return items[0];
    return `${names} · ${t.campaigns.every} ${Math.round(c.rotation_seconds / 60)} min`;
  }

  function whenLabel(c: CampaignRow): string {
    const parts: string[] = [];
    if (c.starts_on || c.ends_on) {
      const from = c.starts_on ? dateFmt.format(new Date(`${c.starts_on}T12:00`)) : "…";
      const to = c.ends_on ? dateFmt.format(new Date(`${c.ends_on}T12:00`)) : "…";
      parts.push(`${from} → ${to}`);
    }
    const start = hhmm(c.start_time);
    const end = hhmm(c.end_time);
    if (start && end) parts.push(`${start}–${end}`);
    return parts.length > 0 ? parts.join(" · ") : t.campaigns.always;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t.campaigns.title}</h1>
          <p className="mt-1 text-sm text-muted">{t.campaigns.subtitle}</p>
        </div>
        <Link
          href="/campanhas/nova"
          className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          {t.campaigns.new}
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <p className="mt-8 rounded-xl border border-line bg-surface p-6 text-sm text-muted">
          {t.campaigns.empty}
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {campaigns.map((c) => (
            <li key={c.id} className="rounded-xl border border-line bg-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="mt-1 text-xs text-muted">
                    {playlistLabel(c)}
                    {c.fit_mode ? ` · ${CONTENT_FIT_LABELS[c.fit_mode]}` : ""}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    <span className="text-foreground">{t.campaigns.where}:</span>{" "}
                    {whereLabel(c.campaign_targets?.[0])}
                    {"  "}
                    <span className="ml-2 text-foreground">{t.campaigns.when}:</span>{" "}
                    {whenLabel(c)}
                  </p>
                </div>
                <CampaignActions id={c.id} name={c.name} active={c.is_active} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
