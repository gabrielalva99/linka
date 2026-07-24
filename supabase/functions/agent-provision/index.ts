// LINKA — Edge Function: pareamento do agente.
// O aparelho informa o código de pareamento (provisioning_code) e recebe um device_token,
// usado depois nos heartbeats. Autenticação própria (sem JWT do Supabase).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

/**
 * Liga o modelo reportado pelo aparelho ao catálogo do cliente.
 * "motorola edge 30 ultra" e "Moto Edge 30 Ultra" viram a mesma chave; só vincula
 * quando a correspondência é única (na dúvida, deixa para uma pessoa decidir).
 */
function modelKey(s: string) {
  return s.toLowerCase().replace(/motorola|moto\b/g, "").replace(/[^a-z0-9]/g, "");
}

async function linkCatalogModel(
  supabase: ReturnType<typeof createClient>,
  deviceId: string,
  tenantId: string,
  hardwareModel: string,
) {
  const { data: models } = await supabase
    .from("device_models")
    .select("id, name")
    .eq("tenant_id", tenantId);
  const key = modelKey(hardwareModel);
  const hits = (models ?? []).filter((m) => modelKey(String(m.name)) === key);
  if (hits.length === 1) {
    await supabase.from("devices").update({ model_id: hits[0].id }).eq("id", deviceId);
  }
}

function newToken() {
  return (
    crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "")
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const code = String(payload.provisioning_code ?? "").trim().toUpperCase();
  if (!code) return json({ error: "missing_code" }, 400);

  const supabase = createClient(url, serviceKey);

  const { data: device, error } = await supabase
    .from("devices")
    .select("id, device_token, tenant_id, model_id")
    .eq("provisioning_code", code)
    .maybeSingle();

  if (error) return json({ error: "server_error" }, 500);
  if (!device) return json({ error: "code_not_found" }, 404);

  const token = (device.device_token as string | null) ?? newToken();

  const update: Record<string, unknown> = {
    device_token: token,
    status: "online",
    last_seen_at: new Date().toISOString(),
  };
  if (payload.android_id) update.android_id = String(payload.android_id);
  if (payload.hardware_model) update.hardware_model = String(payload.hardware_model);
  if (payload.os_version) update.os_version = String(payload.os_version);
  if (payload.agent_version) update.agent_version = String(payload.agent_version);
  if (payload.platform === "android" || payload.platform === "ios") {
    update.platform = payload.platform;
  }

  const { error: upErr } = await supabase.from("devices").update(update).eq("id", device.id);
  if (upErr) return json({ error: "update_failed" }, 500);

  if (!device.model_id && payload.hardware_model) {
    await linkCatalogModel(
      supabase,
      String(device.id),
      String(device.tenant_id),
      String(payload.hardware_model),
    );
  }

  return json({ device_id: device.id, device_token: token });
});
