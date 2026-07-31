// LINKA — Edge Function: acorda o aparelho por push (FCM).
//
// O QUE ELA MANDA. Uma mensagem só, sempre a mesma: "fale comigo agora". Nenhum
// conteúdo viaja no push, de propósito:
//   - push é melhor esforço. Se ele carregasse a campanha, um push perdido
//     deixaria o aparelho com conteúdo velho e ninguém saberia;
//   - o heartbeat já sabe entregar tudo (comando e "mudou o conteúdo"). O push só
//     antecipa a próxima batida.
// Ou seja: o push é atalho, nunca o único caminho. É o mesmo desenho do "Collect
// Now" do Xibo, e é o que permite o heartbeat ficar lento sem risco.
//
// QUEM PODE CHAMAR. Só quem tem a guarda, que nasceu dentro do banco e mora no
// cofre. Sem isso, qualquer um na internet manda 250 aparelhos falarem com o
// servidor ao mesmo tempo — um botão de DDoS contra a própria frota.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROJETO_FCM = "linka-plataforma";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Token do Google, guardado enquanto vale.
//
// Ele dura uma hora. Assinar um JWT novo a cada push custaria uma ida ao Google
// por aparelho — num envio para uma rede inteira, isso é a parte lenta.
let acessoGoogle: { token: string; expira: number } | null = null;

async function tokenDoGoogle(conta: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  if (acessoGoogle && acessoGoogle.expira > agora + 60) return acessoGoogle.token;

  const cabecalho = { alg: "RS256", typ: "JWT" };
  const corpo = {
    iss: conta.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: agora,
    exp: agora + 3600,
  };
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const naoAssinado = `${b64(cabecalho)}.${b64(corpo)}`;

  // A chave vem em PEM PKCS#8; o Web Crypto quer os bytes crus.
  const pem = conta.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const bytes = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const chave = await crypto.subtle.importKey(
    "pkcs8",
    bytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    chave,
    new TextEncoder().encode(naoAssinado),
  );
  const assinaturaB64 = btoa(String.fromCharCode(...new Uint8Array(assinatura)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${naoAssinado}.${assinaturaB64}`,
    }),
  });
  const dados = await r.json();
  if (!dados.access_token) throw new Error(`google recusou: ${JSON.stringify(dados)}`);
  acessoGoogle = { token: dados.access_token, expira: agora + 3500 };
  return dados.access_token;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabase = createClient(url, serviceKey);

  // A guarda: os dois lados leem do mesmo cofre, então não há valor duplicado
  // para alguém esquecer de trocar.
  const { data: guarda } = await supabase.rpc("ler_segredo", { p_nome: "push_guarda" });
  if (!guarda || req.headers.get("x-linka-guarda") !== guarda) {
    return json({ error: "sem_guarda" }, 401);
  }

  let payload: {
    device_id?: string;
    store_id?: string;
    tenant_id?: string;
    motivo?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // Um aparelho, os de uma loja, ou a frota de um cliente. Aparelho sem endereço
  // no FCM é pulado em silêncio: ele continua sendo atendido pelo heartbeat.
  //
  // A loja entrou junto com o push de conteúdo: mudar o horário de funcionamento
  // muda o que TODOS os aparelhos daquela loja fazem (acordar a tela, dormir), e
  // acordar o cliente inteiro por causa de uma loja é chamada jogada fora nas
  // outras catorze.
  let q = supabase.from("devices").select("id, push_token").not("push_token", "is", null);
  if (payload.device_id) q = q.eq("id", payload.device_id);
  else if (payload.store_id) q = q.eq("store_id", payload.store_id).eq("is_active", true);
  else if (payload.tenant_id) q = q.eq("tenant_id", payload.tenant_id).eq("is_active", true);
  else return json({ error: "sem_alvo" }, 400);
  // O motivo não muda nada do que é enviado — ele existe para o registro. Sem
  // ele, "comando" e "conteúdo" ficam indistinguíveis na hora de conferir se o
  // gatilho novo está mesmo disparando, e a única alternativa seria adivinhar
  // pelo horário.
  const motivo = String(payload.motivo ?? "?").slice(0, 40);

  const { data: alvos } = await q;
  if (!alvos || alvos.length === 0) {
    console.log(`push ${motivo}: nenhum aparelho com endereço`);
    return json({ ok: true, enviados: 0 });
  }

  const { data: contaJson } = await supabase.rpc("ler_segredo", {
    p_nome: "fcm_service_account",
  });
  if (!contaJson) return json({ error: "sem_chave" }, 500);
  const acesso = await tokenDoGoogle(JSON.parse(contaJson));

  let enviados = 0;
  const mortos: string[] = [];
  for (const alvo of alvos) {
    const r = await fetch(
      `https://fcm.googleapis.com/v1/projects/${PROJETO_FCM}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${acesso}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: alvo.push_token,
            // SÓ DADOS, sem "notification": nada pode aparecer na tela de uma
            // vitrine de loja. Prioridade alta porque a mensagem existe para o
            // aparelho agir agora — sem ela o Android pode segurar até o aparelho
            // acordar por outro motivo.
            data: { acao: "falar_agora" },
            android: { priority: "HIGH" },
          },
        }),
      },
    );
    if (r.ok) {
      enviados++;
      continue;
    }
    // Endereço morto (app reinstalado, restauração de fábrica): limpar é
    // obrigatório. Endereço velho na tabela vira erro em todo envio futuro e some
    // no meio do ruído, e o aparelho fica sem atalho sem ninguém perceber.
    const erro = await r.text();
    if (r.status === 404 || erro.includes("UNREGISTERED") || erro.includes("INVALID_ARGUMENT")) {
      mortos.push(alvo.id);
    }
  }
  if (mortos.length > 0) {
    await supabase
      .from("devices")
      .update({ push_token: null, push_token_at: null })
      .in("id", mortos);
  }

  console.log(
    `push ${motivo}: ${enviados}/${alvos.length} enviados, ${mortos.length} endereços limpos`,
  );
  return json({ ok: true, enviados, limpos: mortos.length });
});
