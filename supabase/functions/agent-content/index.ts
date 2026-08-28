// LINKA — Edge Function: conteúdo do agente.
// O aparelho pergunta o que exibir; quem decide é resolve_device_content no banco
// (vídeo fixo do aparelho > campanha mais específica, no fuso da loja).
// Devolve também a lista completa da campanha, para o aparelho baixar tudo antes
// e nunca depender da rede da loja no momento da troca.
//
// DESDE 0.52: montar a resposta virou trabalho de _shared/conteudo.ts, porque o
// heartbeat precisa da MESMA resposta para calcular a revisão. Ver o comentário
// de lá — a duplicação é que criaria buraco silencioso.
//
// Esta função deixou de ser o caminho normal do dia a dia. Quem avisa que mudou é
// o heartbeat, que já roda de qualquer jeito; aqui só se entra quando há novidade
// de verdade, no primeiro contato, ou na rede de segurança de 30 em 30 minutos.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  CAMPOS_DO_APARELHO,
  montarConteudo,
  revisaoDe,
} from "../_shared/conteudo.ts";

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
  // SÓ NO CABEÇALHO, desde 28/08.
  //
  // Antes o token também era aceito no corpo. Credencial no corpo de um POST
  // vaza mais fácil: aparece em log de aplicação, em ferramenta de depuração e
  // em qualquer captura que registre payload, enquanto cabeçalho de autorização
  // costuma ser mascarado por padrão.
  //
  // Conferido antes de tirar: o agente manda pelo cabeçalho em todas as três
  // rotas (Api.post assina com Authorization), e `device_token` só aparece no
  // agente ao LER a resposta do provisionamento. A frota inteira está na 0.112.
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json({ error: "missing_token" }, 401);

  const supabase = createClient(url, serviceKey);
  const { data: device } = await supabase
    .from("devices")
    .select(CAMPOS_DO_APARELHO)
    .eq("device_token", token)
    .maybeSingle();
  if (!device) return json({ error: "invalid_token" }, 401);

  const conteudo = await montarConteudo(supabase, device);

  // A revisão vai junto: é o que o aparelho devolve no heartbeat para o servidor
  // responder se ainda está em dia. Ele só guarda depois de aplicar — assim uma
  // resposta recebida mas não aplicada não faz o aparelho se declarar atualizado.
  return json({ ...conteudo, revisao: await revisaoDe(conteudo) });
});
