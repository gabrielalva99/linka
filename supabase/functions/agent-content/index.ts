// LINKA — Edge Function: conteúdo do agente.
// O aparelho pergunta o que exibir; quem decide é resolve_device_content no banco
// (vídeo fixo do aparelho > campanha mais específica, no fuso da loja).
// Devolve também a lista completa da campanha, para o aparelho baixar tudo antes
// e nunca depender da rede da loja no momento da troca.
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
    .select("id, idle_return_seconds, volume_percent, agent_version, cleanup_enabled, cleanup_time, block_settings")
    .eq("device_token", token)
    .maybeSingle();
  if (!device) return json({ error: "invalid_token" }, 401);

  const { data: rows } = await supabase.rpc("resolve_device_content", {
    p_device_id: device.id,
  });
  const resolved = Array.isArray(rows) ? rows[0] : null;
  const contentUrl: string | null = resolved?.out_url ?? null;

  // Lista para baixar: a campanha inteira (o rodízio não pode esperar download).
  let prefetch: string[] = contentUrl ? [contentUrl] : [];
  if (resolved?.out_campaign_id) {
    const { data: items } = await supabase
      .from("campaign_items")
      .select("position, media_assets(url)")
      .eq("campaign_id", resolved.out_campaign_id)
      .order("position");
    const urls = (items ?? [])
      .map((i: { media_assets: { url: string } | { url: string }[] | null }) => {
        const rel = i.media_assets;
        return Array.isArray(rel) ? rel[0]?.url : rel?.url;
      })
      .filter((u): u is string => typeof u === "string" && u.length > 0);
    if (urls.length > 0) prefetch = urls;
  }

  // Versão atual do app: o aparelho decide se precisa se atualizar.
  const { data: release } = await supabase
    .from("agent_releases")
    .select("version, url")
    .eq("is_current", true)
    .maybeSingle();
  // Manda sempre: quem compara versões (e recusa rebaixar) é o agente.
  const agentUpdate = release
    ? { version: release.version, url: release.url }
    : null;

  return json({
    content_url: contentUrl,
    fit: resolved?.out_fit ?? "zoom",
    prefetch,
    // Comportamento do aparelho vem do servidor: ajustar não exige novo APK.
    idle_return_seconds: device.idle_return_seconds ?? 30,
    volume_percent: device.volume_percent ?? 0,
    block_settings: device.block_settings ?? false,
    cleanup_enabled: device.cleanup_enabled ?? true,
    cleanup_time: String(device.cleanup_time ?? "23:00").slice(0, 5),
    // Quem decide "estou atualizado" é o aparelho (ele conhece as duas pontas);
    // o servidor comparando com o cache dava "atualizado" logo após instalar.
    current_version: release?.version ?? null,
    agent_update: agentUpdate,
  });
});
