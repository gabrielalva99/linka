// LINKA — Edge Function: remover pessoa do painel, DE VERDADE.
//
// O PROBLEMA QUE ISTO RESOLVE. "Tirar acesso" apagava só o vínculo
// (memberships). A CONTA DE LOGIN continuava existindo no banco: a pessoa saía
// da tela e continuava conseguindo entrar — num painel vazio, mas entrando. O
// Gabriel chamou isso de "acesso fantasma", e o nome está certo: revogação que
// não revoga o login é revogação pela metade. Pior num produto que vai ter
// agência, promotor e cliente entrando e saindo de contrato.
//
// POR QUE PRECISA DE EDGE FUNCTION. Apagar conta de autenticação exige a chave de
// serviço, que nunca pode chegar ao navegador. O painel manda o pedido; quem
// executa é aqui, com a permissão de quem pediu conferida antes.
//
// A REGRA DA CONTA APAGADA, e ela é conservadora de propósito:
//   - o vínculo com ESTE cliente sai sempre;
//   - a conta em si só é apagada se a pessoa não tiver mais NENHUM outro
//     cliente. Uma agência que atende Motorola e Claro não pode perder o login
//     porque saiu de um dos dois;
//   - conta de superadmin nunca é apagada por aqui. Quem opera a plataforma não
//     é removido por uma tela de cliente;
//   - ninguém remove a si mesmo. Tirar o próprio acesso é a forma mais rápida de
//     ficar de fora do painel sem ter quem te coloque de volta.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
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

  const alvoId = String(payload.user_id ?? "");
  const tenantId = String(payload.tenant_id ?? "");
  if (!alvoId || !tenantId) return json({ error: "faltam_dados" }, 400);

  // Quem está pedindo? Sai do próprio token, nunca do corpo do pedido — senão
  // qualquer um se declararia superadmin escrevendo uma linha de JSON.
  const auth = req.headers.get("Authorization") ?? "";
  const comoUsuario = createClient(url, anonKey, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await comoUsuario.auth.getUser();
  if (!user) return json({ error: "sem_sessao" }, 401);

  if (user.id === alvoId) return json({ error: "nao_remova_a_si_mesmo" }, 400);

  const admin = createClient(url, serviceKey);

  // Permissão: superadmin da plataforma, ou agência DESTE cliente.
  const { data: perfil } = await admin
    .from("profiles").select("is_superadmin").eq("id", user.id).maybeSingle();
  const ehSuperadmin = perfil?.is_superadmin === true;

  if (!ehSuperadmin) {
    const { data: vinculo } = await admin
      .from("memberships").select("role")
      .eq("user_id", user.id).eq("tenant_id", tenantId).maybeSingle();
    if (vinculo?.role !== "agency") return json({ error: "sem_permissao" }, 403);
  }

  // Superadmin não é removido por tela de cliente.
  const { data: alvo } = await admin
    .from("profiles").select("email, is_superadmin").eq("id", alvoId).maybeSingle();
  if (!alvo) return json({ error: "pessoa_nao_encontrada" }, 404);
  if (alvo.is_superadmin) return json({ error: "nao_remova_superadmin" }, 403);

  // 1. O vínculo com este cliente sai sempre.
  const { error: errVinculo } = await admin
    .from("memberships").delete()
    .eq("user_id", alvoId).eq("tenant_id", tenantId);
  if (errVinculo) return json({ error: "falha_ao_remover_vinculo" }, 500);

  // 2. Sobrou acesso a algum outro cliente? Se sim, a conta fica.
  const { count } = await admin
    .from("memberships")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", alvoId);
  const aindaTemAcesso = (count ?? 0) > 0;

  let contaApagada = false;
  if (!aindaTemAcesso) {
    // Apagar em auth.users leva o profile junto (cascata) — e é isso que acaba
    // com o fantasma: sem conta de login, não há mais como entrar.
    const { error: errConta } = await admin.auth.admin.deleteUser(alvoId);
    if (errConta) {
      // O vínculo já saiu, então o acesso está cortado. Não fingimos sucesso
      // total: o painel precisa poder dizer que a conta continua lá.
      return json({
        ok: true,
        conta_apagada: false,
        aviso: "acesso_removido_mas_conta_permanece",
        email: alvo.email,
      });
    }
    contaApagada = true;
  }

  await admin.from("audit_log").insert({
    actor_id: user.id,
    tenant_id: tenantId,
    action: contaApagada ? "remover_pessoa_e_conta" : "remover_acesso",
    entity: "profile",
    entity_id: alvoId,
    metadata: { email: alvo.email, conta_apagada: contaApagada },
  });

  return json({ ok: true, conta_apagada: contaApagada, email: alvo.email });
});
