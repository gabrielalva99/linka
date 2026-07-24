import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { EditDeviceForm } from "./edit-form";

export default async function EditarDispositivoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: device }, { data: models }, { data: stores }, { data: positions }] =
    await Promise.all([
      supabase
        .from("devices")
        .select(
          "id, name, code, model_id, store_id, position_id, platform, device_type, imei, hardware_model",
        )
        .eq("id", id)
        .single(),
      supabase.from("device_models").select("id, name, line").order("name"),
      supabase.from("stores").select("id, name, code").order("name"),
      supabase.from("positions").select("id, label, store_id").order("label"),
    ]);
  if (!device) notFound();

  const t = getMessages();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold">{t.deviceForm.edit}</h1>
      <div className="mt-6">
        <EditDeviceForm
          deviceId={device.id as string}
          models={(models ?? []).map((m) => ({
            id: m.id as string,
            label: m.line ? `${m.name} (${m.line})` : (m.name as string),
          }))}
          stores={(stores ?? []).map((s) => ({
            id: s.id as string,
            label: s.code ? `${s.name} · ${s.code}` : (s.name as string),
          }))}
          positions={(positions ?? []).map((p) => ({
            id: p.id as string,
            label: p.label as string,
            storeId: p.store_id as string,
          }))}
          defaults={{
            name: device.name as string,
            code: device.code as string | null,
            modelId: device.model_id as string | null,
            storeId: device.store_id as string | null,
            positionId: device.position_id as string | null,
            platform: device.platform as string | null,
            deviceType: device.device_type as string | null,
            imei: device.imei as string | null,
          }}
          detectedModel={device.hardware_model as string | null}
        />
      </div>
    </div>
  );
}
