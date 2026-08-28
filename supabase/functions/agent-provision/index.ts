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
  // Identidade que sobrevive à restauração de fábrica. É por ela que um aparelho
  // restaurado volta para o PRÓPRIO cadastro em vez de criar um segundo.
  const FONTES_ID = new Set(["esid", "serial", "android_id"]);
  const stableId = payload.stable_id ? String(payload.stable_id).slice(0, 120) : "";
  const stableIdSource = FONTES_ID.has(String(payload.stable_id_source))
    ? String(payload.stable_id_source)
    : null;
  const hardwareModel = payload.hardware_model ? String(payload.hardware_model) : "";

  // O TIPO DO APARELHO, dito por ele mesmo — e só no nascimento do registro.
  //
  // Antes daqui estava "smartphone" escrito fixo. Passou despercebido enquanto a
  // frota era só de celular; deixou de passar em 20/08, com um TV box e um tablet
  // Samsung chegando E a publicação de versão ganhando alvo por tipo. Um tablet
  // cadastrado como celular receberia a versão mirada em CELULARES e não a mirada
  // em TABLETS — o oposto do que quem publicou pediu, sem erro nenhum na tela.
  //
  // Validado contra a lista do enum de propósito: valor estranho vindo do
  // aparelho vira "smartphone" em vez de estourar o provisionamento na loja.
  const TIPOS = new Set(["smartphone", "tablet", "tv", "notebook", "other"]);
  const deviceType = TIPOS.has(String(payload.device_type))
    ? String(payload.device_type)
    : "smartphone";

  const supabase = createClient(url, serviceKey);

  // Freio de chute. Esta porta não tem como exigir login — quem bate é aparelho,
  // numa loja, antes de existir na frota — então o que dá para fazer é contar
  // quem erra. Vinte erros em quinze minutos da mesma origem e a porta fecha por
  // um tempo. Um técnico erra o código duas, três vezes; um laço automatizado
  // erra milhares.
  // ── DE ONDE VEM O "QUEM", e por que não é o começo da cadeia (28/08) ──────
  //
  // Antes: primeiro elemento de x-forwarded-for. Esse valor é escrito pelo
  // CLIENTE e a plataforma apenas acrescenta o dela no fim. Ou seja, quem
  // chamasse mandando `X-Forwarded-For: <valor ao acaso>` trocava de identidade
  // a cada tentativa, e o freio de vinte erros nunca fechava. O único controle
  // contra chute do código de entrada era contornável com um cabeçalho.
  //
  // Agora, em ordem: o IP que a borda afirma (não é escrito pelo cliente), e
  // senão o ÚLTIMO da cadeia, que é o que o gateway anexou. O que o cliente
  // enviar fica no meio e é ignorado.
  const cadeia = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const ip =
    req.headers.get("cf-connecting-ip")?.trim() ||
    (cadeia.length > 0 ? cadeia[cadeia.length - 1] : "") ||
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

    // A IDENTIDADE ESTÁVEL VEM PRIMEIRO, e é o conserto do aparelho fantasma.
    //
    // O android_id MUDA numa restauração de fábrica. Na loja isso acontece: o
    // cliente mexe, ninguém consegue destravar, alguém restaura. O aparelho voltava
    // como número novo, o provisionamento criava um cadastro novo, e o antigo ficava
    // de fantasma — com a posição, o histórico e a loja dele. Em 250 aparelhos é o
    // painel dizer 260 e ninguém conseguir apontar qual sobra.
    //
    // Procurando pela identidade estável primeiro, o aparelho restaurado cai no
    // próprio cadastro: mantém código, loja, posição e histórico.
    if (stableId) {
      const { data: mesmoFerro } = await supabase
        .from("devices")
        .select("id, device_token, tenant_id, model_id, store_id")
        .eq("tenant_id", tenant.id)
        .eq("stable_id", stableId)
        .maybeSingle();
      if (mesmoFerro) device = mesmoFerro;
    }

    // Reinstalar o app no MESMO aparelho não pode criar um segundo cadastro:
    // o identificador do Android é o que diz que é o mesmo ferro.
    //
    // Continua como segunda tentativa: aparelho que ainda não reportou identidade
    // estável (agente antigo) precisa de um caminho.
    if (!device && androidId) {
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
          // Palpite do aparelho. A partir daqui quem manda é o painel: este valor
          // NÃO é reescrito nas entradas seguintes, senão uma correção feita à mão
          // ("este tablet é um totem") seria desfeita no próximo provisionamento.
          device_type: deviceType,
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
    // VOLTOU PARA A VITRINE: a retirada para venda deixa de valer.
    //
    // Aparelho retirado sai da lista de pendências de propósito (aparelho
    // vendido não é aparelho com defeito). Mas venda desfeita, aparelho
    // reaproveitado ou retirada feita por engano trazem o aparelho de volta — e
    // sem limpar aqui ele voltaria a operar INVISÍVEL: sem alerta de fora do ar,
    // sem aparecer em pendência nenhuma, para sempre. Um aparelho mudo numa loja
    // é pior que um aparelho com problema, porque ninguém vai procurar.
    //
    // Visto no Razr em 19/08: reprovisionado, tocando vídeo, e ainda marcado
    // como retirado.
    retirado_em: null,
    retirado_por: null,
    retirado_cargo: null,
    retirado_loja: null,
  };
  // Aparelho que já existia e foi reprovisionado com código de loja mudou de
  // lugar de verdade — quem está com ele na mão sabe melhor que o cadastro.
  if (storeId) update.store_id = storeId;
  if (androidId) update.android_id = androidId;
  if (hardwareModel) update.hardware_model = hardwareModel;
  if (stableId) {
    update.stable_id = stableId;
    if (stableIdSource) update.stable_id_source = stableIdSource;
  }
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
