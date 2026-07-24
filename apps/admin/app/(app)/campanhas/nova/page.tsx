import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { CampaignForm } from "../campaign-form";

export default async function NovaCampanhaPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: media }, { data: chains }, { data: stores }, { data: devices }] =
    await Promise.all([
      supabase.from("media_assets").select("id, name").order("created_at", {
        ascending: false,
      }),
      supabase.from("retail_chains").select("id, name").order("name"),
      supabase.from("stores").select("id, name, code").order("name"),
      supabase.from("devices").select("id, name, code").order("code"),
    ]);

  const t = getMessages();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold">{t.campaigns.new}</h1>
      <p className="mt-1 text-sm text-muted">{t.campaigns.subtitle}</p>
      <div className="mt-6">
        <CampaignForm
          media={(media ?? []).map((m) => ({
            id: m.id as string,
            label: m.name as string,
          }))}
          chains={(chains ?? []).map((c) => ({
            id: c.id as string,
            label: c.name as string,
          }))}
          stores={(stores ?? []).map((s) => ({
            id: s.id as string,
            label: s.code ? `${s.name} · ${s.code}` : (s.name as string),
          }))}
          devices={(devices ?? []).map((d) => ({
            id: d.id as string,
            label: d.code ? `${d.code} · ${d.name}` : (d.name as string),
          }))}
        />
      </div>
    </div>
  );
}
