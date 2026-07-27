// LINKA — Edge Function: ingestão de eventos de interação.
// Recebe lotes do aparelho. A gravação é IDEMPOTENTE: o mesmo evento reenviado
// depois de uma queda de rede não vira contagem dobrada no BI — é o que permite
// ao agente reenviar sem medo quando a loja volta a ter internet.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const KINDS = new Set(["app_usage", "screen_session"]);
const MAX_LOTE = 500;

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
    .select("id, tenant_id")
    .eq("device_token", token)
    .maybeSingle();
  if (!device) return json({ error: "invalid_token" }, 401);

  const entrada = Array.isArray(payload.events) ? payload.events : [];
  if (entrada.length === 0) return json({ ok: true, saved: 0 });
  if (entrada.length > MAX_LOTE) return json({ error: "batch_too_large" }, 413);

  // Validação por evento: um item torto não pode derrubar o lote inteiro.
  const linhas = entrada
    .map((e: Record<string, unknown>) => {
      const eventId = String(e.event_id ?? "").slice(0, 80);
      const kind = String(e.kind ?? "");
      const startedAt = String(e.started_at ?? "");
      if (!eventId || !KINDS.has(kind) || !startedAt) return null;
      const dur = Number(e.duration_seconds);
      return {
        tenant_id: device.tenant_id,
        device_id: device.id,
        event_id: eventId,
        kind,
        package: e.package ? String(e.package).slice(0, 120) : null,
        started_at: startedAt,
        ended_at: e.ended_at ? String(e.ended_at) : null,
        duration_seconds: Number.isFinite(dur) && dur >= 0 ? Math.round(dur) : null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (linhas.length === 0) return json({ ok: true, saved: 0, ignored: entrada.length });

  const { error } = await supabase
    .from("device_events")
    .upsert(linhas, { onConflict: "device_id,event_id", ignoreDuplicates: true });
  if (error) return json({ error: "insert_failed", detail: error.message }, 500);

  return json({ ok: true, saved: linhas.length, ignored: entrada.length - linhas.length });
});
