// LINKA — Edge Function: heartbeat do agente.
// O aparelho reporta status/bateria/modo periodicamente, autenticando com o device_token
// (header Authorization: Bearer <token> ou campo device_token no corpo).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STATUS = new Set(["provisioning", "online", "degraded", "offline"]);
const MODE = new Set([
  "not_running",
  "main_menu",
  "show",
  "protection",
  "sleep",
  "alarm",
]);
const FIT = new Set(["zoom", "fit"]);

/** Mesma normalização do agent-provision: "motorola edge 30 ultra" ≡ "Moto Edge 30 Ultra". */
function modelKey(s: string) {
  return s.toLowerCase().replace(/motorola|moto\b/g, "").replace(/[^a-z0-9]/g, "");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
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

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const token = bearer || String(payload.device_token ?? "");
  if (!token) return json({ error: "missing_token" }, 401);

  const supabase = createClient(url, serviceKey);

  const { data: device } = await supabase
    .from("devices")
    .select("id, tenant_id, model_id")
    .eq("device_token", token)
    .maybeSingle();
  if (!device) return json({ error: "invalid_token" }, 401);

  const update: Record<string, unknown> = {
    status: STATUS.has(String(payload.status)) ? payload.status : "online",
    last_seen_at: new Date().toISOString(),
  };
  if (MODE.has(String(payload.mode))) update.mode = payload.mode;
  if (payload.os_version != null) update.os_version = String(payload.os_version);
  if (payload.agent_version != null) update.agent_version = String(payload.agent_version);
  if (payload.battery_level != null) {
    const n = Number(payload.battery_level);
    if (Number.isFinite(n) && n >= 0 && n <= 100) update.battery_level = Math.round(n);
  }
  if (typeof payload.battery_charging === "boolean") {
    update.battery_charging = payload.battery_charging;
  }
  if (typeof payload.synced === "boolean") update.synced = payload.synced;
  if (typeof payload.app_updated === "boolean") update.app_updated = payload.app_updated;
  if ("playing_url" in payload) {
    update.playing_url =
      typeof payload.playing_url === "string" && payload.playing_url.length > 0
        ? payload.playing_url
        : null;
  }
  if ("playing_fit" in payload) {
    update.playing_fit = FIT.has(String(payload.playing_fit)) ? payload.playing_fit : null;
  }

  const hardwareModel = payload.hardware_model ? String(payload.hardware_model) : null;
  if (hardwareModel) update.hardware_model = hardwareModel;

  const { error } = await supabase.from("devices").update(update).eq("id", device.id);
  if (error) return json({ error: "update_failed" }, 500);

  // Aparelho sem modelo no catálogo: tenta ligar sozinho (evita digitar 250 vezes).
  if (!device.model_id && hardwareModel) {
    const { data: models } = await supabase
      .from("device_models")
      .select("id, name")
      .eq("tenant_id", device.tenant_id);
    const key = modelKey(hardwareModel);
    const hits = (models ?? []).filter((m) => modelKey(String(m.name)) === key);
    if (hits.length === 1) {
      await supabase.from("devices").update({ model_id: hits[0].id }).eq("id", device.id);
    }
  }

  return json({ ok: true });
});
