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

  // Freio de chute. Esta porta não tem como exigir login — quem bate é aparelho,
  // numa loja, antes de existir na frota — então o que dá para fazer é contar
  // quem erra. Vinte erros em quinze minutos da mesma origem e a porta fecha por
  // um tempo. Um técnico erra o código duas, três vezes; um laço automatizado
  // erra milhares.
  const ip =
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "desconhecido";

  const desde = new Date(Date.now() - 15 * 60_000).toISOString();
  const { count: errosRecentes } = await supabase
    .from("provision_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("ok", false)
    .gte("created_at", desde);

  if ((errosRecentes ?? 0) >= 20) {
    return json({ error: "muitas_tentativas" }, 429);
  }

  /** Registra o resultado e devolve a resposta, para não esquecer nenhum caminho. */
  const responder = async (corpo: Record<string, unknown>, status: number) => {
    await supabase.from("provision_attempts").insert({ ip, ok: status < 300 });
    return json(corpo, status);
  };

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
    if (!tenant) return responder({ error: "code_not_found" }, 404);
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
        return responder({ error: "store_not_found", store_code: codigoLoja }, 404);
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
      if (insErr || !criado) return responder({ error: "create_failed" }, 500);
      device = criado;
    }
  }

  // Token NOVO a cada entrada, mesmo para aparelho que já existia.
  //
  // Reaproveitar o token antigo era o segundo achado do pentest: quem tivesse o
  // código de inscrição (papel esquecido na loja, foto num grupo) mandava o
  // identificador de um aparelho já cadastrado e recebia o token dele, sem
  // provar posse nenhuma — e passava a conviver com o aparelho de verdade, os
  // dois falando com o servidor, ninguém percebendo.
  //
  // Não dá para exigir prova de posse aqui: o caso legítimo é reinstalar o app,
  // e o aparelho reinstalado não tem token para apresentar. O que dá é acabar
  // com a convivência. Trocando o token, o aparelho real perde o acesso na hora
  // e cai como "fora do ar" no painel — um ataque silencioso vira um alerta.
  const token = newToken();

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
  if (upErr) return responder({ error: "update_failed" }, 500);

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
  return responder({
    device_id: device.id,
    device_token: token,
    tenant_name: tenantName,
    store_name: storeName,
  }, 200);
});
