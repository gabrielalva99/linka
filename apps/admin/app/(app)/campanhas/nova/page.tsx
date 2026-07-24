import { getMessages } from "@/lib/i18n";
import { CampaignForm } from "../campaign-form";
import { loadCampaignOptions } from "../options";

export default async function NovaCampanhaPage() {
  const options = await loadCampaignOptions();
  const t = getMessages();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold">{t.campaigns.new}</h1>
      <p className="mt-1 text-sm text-muted">{t.campaigns.subtitle}</p>
      <div className="mt-6">
        <CampaignForm {...options} />
      </div>
    </div>
  );
}
