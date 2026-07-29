// LINKA — Edge Function: entrada do aparelho na frota.
//
// Aceita três formatos no mesmo campo, porque na loja ninguém vai distinguir um
// do outro:
//
//  1. Código do APARELHO (provisioning_code): o escritório cadastrou antes e
//     sabe exatamente qual aparelho vai para qual loja.
//  2. Código do CLIENTE (enrollment_code): um só, vai no kit do técnico. O
//     aparelho se cadastra sozinho e chega ao painel dizendo modelo, Android e
//     identificador — mas sem loja.
//  3. Código do CLIENTE + LOJA ("LKYYKHQ6-SPC7613"): o aparelho entra já na
//     loja certa.
//
// O terceiro existe porque a instalação é loja a loja, com equipe técnica em
// visita. Quem está lá SABE em que loja está; era o painel que ficava esperando
// alguém dizer isso depois, aparelho por aparelho. Com 250 na rua, "depois" são
// 250 formulários preenchidos por quem nunca esteve na loja e não tem como
// conferir nada.
//
// verify_jwt FICA DESLIGADO: quem chama é aparelho, não pessoa.
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

/** "motorola razr 60 ultra" + final do identificador = nome que dá para achar na lista. */
function autoName(hardwareModel: string, androidId: string) {
  const modelo = hardwareModel.trim() || "Aparelho";
  const fim = androidId.slice(-4).toUpperCase();
  return fim ? `${modelo} ${fim}` : modelo;
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

  const androidId = payload.android_id ? String(payload.android_id) : "";
  const hardwareModel = payload.hardware_model ? String(payload.hardware_model) : "";

  const supabase = createClient(url, serviceKey);

  // Código do aparelho é tentado inteiro, antes de partir no hífen: código
  // cadastrado no escritório pode ter hífen dentro e não é para virar duas
  // coisas.
  let { data: device } = await supabase
    .from("devices")
    .select("id, device_token, tenant_id, model_id, store_id")
    .eq("provisioning_code", code)
    .maybeSingle();

  let storeId: string | null = null;
  let storeName: string | null = null;
  let tenantName: string | null = null;

  // Código do cliente (com ou sem loja): o aparelho se cadastra sozinho.
  if (!device) {
    const corte = code.indexOf("-");
    const codigoCliente = corte === -1 ? code : code.slice(0, corte);
    const codigoLoja = corte === -1 ? "" : code.slice(corte + 1).trim();

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, name")
      .eq("enrollment_code", codigoCliente)
      .maybeSingle();
    if (!tenant) return json({ error: "code_not_found" }, 404);
    tenantName = String(tenant.name);

    if (codigoLoja) {
      const { data: store } = await supabase
        .from("stores")
        .select("id, name")
        .eq("tenant_id", tenant.id)
        .ilike("code", codigoLoja)
        .maybeSingle();
      // Recusa em vez de seguir sem loja. Um erro de digitação que passasse
      // batido colocaria a visita inteira na frota sem lugar, e ninguém
      // descobriria isso na loja — descobriria semanas depois, olhando um
      // relatório com quinze aparelhos órfãos.
      if (!store) {
        return json({ error: "store_not_found", store_code: codigoLoja }, 404);
      }
      storeId = String(store.id);
      storeName = String(store.name);
    }

    // Reinstalar o app no MESMO aparelho não pode criar um segundo cadastro:
    // o identificador do Android é o que diz que é o mesmo ferro.
    if (androidId) {
      const { data: existente } = await supabase
        .from("devices")
        .select("id, device_token, tenant_id, model_id, store_id")
        .eq("tenant_id", tenant.id)
        .eq("android_id", androidId)
        .maybeSingle();
      if (existente) device = existente;
    }

    if (!device) {
      const { data: criado, error: insErr } = await supabase
        .from("devices")
        .insert({
          tenant_id: tenant.id,
          name: autoName(hardwareModel, androidId),
          device_type: "smartphone",
          platform: "android",
          status: "provisioning",
          store_id: storeId,
        })
        .select("id, device_token, tenant_id, model_id, store_id")
        .single();
      if (insErr || !criado) return json({ error: "create_failed" }, 500);
      device = criado;
    }
  }

  const token = (device.device_token as string | null) ?? newToken();

  const update: Record<string, unknown> = {
    device_token: token,
    status: "online",
    last_seen_at: new Date().toISOString(),
  };
  // Aparelho que já existia e foi reprovisionado com código de loja mudou de
  // lugar de verdade — quem está com ele na mão sabe melhor que o cadastro.
  if (storeId) update.store_id = storeId;
  if (androidId) update.android_id = androidId;
  if (hardwareModel) update.hardware_model = hardwareModel;
  if (payload.os_version) update.os_version = String(payload.os_version);
  if (payload.agent_version) update.agent_version = String(payload.agent_version);
  if (payload.platform === "android" || payload.platform === "ios") {
    update.platform = payload.platform;
  }

  const { error: upErr } = await supabase.from("devices").update(update).eq("id", device.id);
  if (upErr) return json({ error: "update_failed" }, 500);

  if (!device.model_id && hardwareModel) {
    await linkCatalogModel(
      supabase,
      String(device.id),
      String(device.tenant_id),
      hardwareModel,
    );
  }

  // Devolve os nomes para o kit conseguir CONFIRMAR em voz alta o que acabou de
  // acontecer. Um código digitado errado que devolve "ok" é como quinze
  // aparelhos vão para a loja errada sem ninguém notar.
  return json({
    device_id: device.id,
    device_token: token,
    tenant_name: tenantName,
    store_name: storeName,
  });
});
