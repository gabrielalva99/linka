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
    .select("id, device_token")
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
  if (payload.serial) update.serial = String(payload.serial);
  if (payload.os_version) update.os_version = String(payload.os_version);
  if (payload.agent_version) update.agent_version = String(payload.agent_version);
  if (payload.platform === "android" || payload.platform === "ios") {
    update.platform = payload.platform;
  }

  const { error: upErr } = await supabase.from("devices").update(update).eq("id", device.id);
  if (upErr) return json({ error: "update_failed" }, 500);

  return json({ device_id: device.id, device_token: token });
});
