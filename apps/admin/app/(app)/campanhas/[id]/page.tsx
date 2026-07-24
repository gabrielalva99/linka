import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { CampaignForm } from "../campaign-form";
import { loadCampaignOptions } from "../options";

type Target = {
  scope: string;
  chain_id: string | null;
  store_id: string | null;
  device_id: string | null;
};

export default async function EditarCampanhaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: campaign }, options] = await Promise.all([
    supabase
      .from("campaigns")
      .select(
        "id, name, fit_mode, starts_on, ends_on, start_time, end_time, rotation_seconds, campaign_items(media_id, position), campaign_targets(scope, chain_id, store_id, device_id)",
      )
      .eq("id", id)
      .single(),
    loadCampaignOptions(),
  ]);
  if (!campaign) notFound();

  const t = getMessages();
  const target = ((campaign.campaign_targets ?? []) as Target[])[0];
  const items = ((campaign.campaign_items ?? []) as {
    media_id: string;
    position: number;
  }[])
    .slice()
    .sort((a, b) => a.position - b.position);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold">{t.campaigns.edit}</h1>
      <div className="mt-6">
        <CampaignForm
          campaignId={campaign.id as string}
          {...options}
          defaults={{
            name: campaign.name as string,
            mediaIds: items.map((i) => i.media_id),
            rotationMinutes: Math.round(
              (campaign.rotation_seconds as number) / 60,
            ),
            scope: target?.scope ?? "tenant",
            targetId:
              target?.chain_id ?? target?.store_id ?? target?.device_id ?? null,
            startsOn: campaign.starts_on as string | null,
            endsOn: campaign.ends_on as string | null,
            startTime: (campaign.start_time as string | null)?.slice(0, 5) ?? null,
            endTime: (campaign.end_time as string | null)?.slice(0, 5) ?? null,
            fitMode: campaign.fit_mode as string | null,
          }}
        />
      </div>
    </div>
  );
}
