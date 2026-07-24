import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { DeviceForm } from "./device-form";

export default async function NovoDispositivoPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: models }, { data: stores }, { data: positions }] = await Promise.all([
    supabase.from("device_models").select("id, name, line").order("name"),
    supabase.from("stores").select("id, name, code").order("name"),
    supabase.from("positions").select("id, label, store_id").order("label"),
  ]);

  const t = getMessages();

  const modelOptions = (models ?? []).map((m) => ({
    id: m.id as string,
    label: m.line ? `${m.name} (${m.line})` : (m.name as string),
  }));
  const storeOptions = (stores ?? []).map((s) => ({
    id: s.id as string,
    label: s.code ? `${s.name} · ${s.code}` : (s.name as string),
  }));
  const positionOptions = (positions ?? []).map((p) => ({
    id: p.id as string,
    label: p.label as string,
    storeId: p.store_id as string,
  }));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold">{t.deviceForm.new}</h1>
      <div className="mt-6">
        <DeviceForm
          models={modelOptions}
          stores={storeOptions}
          positions={positionOptions}
        />
      </div>
    </div>
  );
}
