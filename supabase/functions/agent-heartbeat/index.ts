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
const CONNECTION = new Set(["wifi", "cellular", "ethernet", "none"]);
const COMMANDS = new Set(["deprovision"]);

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
    .select("id, tenant_id, model_id, pending_command")
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

  // Saúde do aparelho (REFERENCIA §12.1) — cada campo é opcional e validado.
  if (payload.temperature_c != null) {
    const n = Number(payload.temperature_c);
    if (Number.isFinite(n) && n > -50 && n < 150) update.temperature_c = n;
  }
  if (payload.uptime_seconds != null) {
    const n = Number(payload.uptime_seconds);
    if (Number.isFinite(n) && n >= 0) update.uptime_seconds = Math.round(n);
  }
  if (typeof payload.screen_on === "boolean") update.screen_on = payload.screen_on;
  if (CONNECTION.has(String(payload.connection))) update.connection = payload.connection;
  if (payload.signal_dbm != null) {
    const n = Number(payload.signal_dbm);
    if (Number.isFinite(n) && n > -200 && n < 0) update.signal_dbm = Math.round(n);
  }

  if (typeof payload.is_device_owner === "boolean") {
    update.is_device_owner = payload.is_device_owner;
  }
  if (typeof payload.kiosk_locked === "boolean") update.kiosk_locked = payload.kiosk_locked;

  // O comando só sai da fila quando o aparelho confirma ter executado.
  const done = payload.command_done ? String(payload.command_done) : null;
  if (done && done === device.pending_command) update.pending_command = null;

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

  // Sem conexão persistente: o comando pendente volta na resposta do heartbeat.
  const pending = device.pending_command ? String(device.pending_command) : null;
  const command = done || !pending || !COMMANDS.has(pending) ? null : pending;
  return json({ ok: true, command });
});
