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

// Esta lista É o que decide o que entra. Evento de tipo desconhecido é descartado
// em silêncio — o aparelho mede, manda, recebe 200 e o dado some. Já custou um
// botão que nunca funcionou (ver a lista de COMMANDS do heartbeat); aqui custaria
// a medição que diferencia o produto. Recurso novo no painel do aparelho não
// precisa de nada aqui, mas TIPO novo de evento precisa, sempre.
const KINDS = new Set([
  "app_usage",
  "screen_session",
  "showcase",
  "media_play",
  // Toque num recurso do painel: mede a INTENÇÃO ("quantos quiseram testar a
  // câmera"), que é pergunta diferente do tempo de uso. Para brilho e volume,
  // que não abrem app nenhum, é o único sinal que existe.
  "feature_tap",
]);
const MAX_LOTE = 500;

/** Último pedaço da URL, sem query string — usado só quando o vídeo já não está na biblioteca. */
function nomeDaUrl(u: string): string {
  try {
    return decodeURIComponent(new URL(u).pathname.split("/").pop() ?? u).slice(0, 120);
  } catch {
    return u.slice(0, 120);
  }
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
    .select("id, tenant_id")
    .eq("device_token", token)
    .maybeSingle();
  if (!device) return json({ error: "invalid_token" }, 401);

  const entrada = Array.isArray(payload.events) ? payload.events : [];
  if (entrada.length === 0) return json({ ok: true, saved: 0 });
  if (entrada.length > MAX_LOTE) return json({ error: "batch_too_large" }, 413);

  // O aparelho só conhece a URL do vídeo. Quem sabe QUAL vídeo é aquilo é o
  // servidor — e resolver aqui, uma vez por lote, evita mandar o aparelho
  // carregar identificadores que ele não usa para nada.
  const urls = [
    ...new Set(
      entrada
        .filter((e: Record<string, unknown>) => e.kind === "media_play" && e.media_url)
        .map((e: Record<string, unknown>) => String(e.media_url)),
    ),
  ];
  const porUrl = new Map<string, { id: string; name: string }>();
  if (urls.length > 0) {
    const { data: assets } = await supabase
      .from("media_assets")
      .select("id, name, url")
      .eq("tenant_id", device.tenant_id)
      .in("url", urls);
    for (const a of assets ?? []) porUrl.set(a.url, { id: a.id, name: a.name });
  }

  // Validação por evento: um item torto não pode derrubar o lote inteiro.
  const linhas = entrada
    .map((e: Record<string, unknown>) => {
      const eventId = String(e.event_id ?? "").slice(0, 80);
      const kind = String(e.kind ?? "");
      const startedAt = String(e.started_at ?? "");
      if (!eventId || !KINDS.has(kind) || !startedAt) return null;
      // TETO DE SANIDADE: RECUSA A DURAÇÃO **E** O FIM.
      //
      // Um trecho não passa de uma hora por construção — o agente fecha na virada
      // da hora. Acima disso é sempre defeito, e o mais comum foi medido em
      // 09/08: o aparelho fica dias sem rodar (desligado, sem rede, app morto),
      // volta, e grava um único trecho cobrindo todo o intervalo. Havia um de
      // 43,7 HORAS de vitrine, num aparelho que exibe vídeo de 15 segundos.
      //
      // OS DOIS CAMPOS, e isso é o que importa. A primeira versão desta trava
      // zerava só `duration_seconds` e não adiantou nada, porque quem monta o
      // relatório lê o FIM primeiro:
      //
      //     coalesce(e.ended_at, e.started_at + interval(duration_seconds))
      //
      // Com o fim de dois dias depois ainda na linha, o rollup seguia
      // distribuindo o tempo pelas horas da loja. Medido no histórico real: 170
      // horas de vitrine no relatório, 107 delas inventadas — 63% do número.
      //
      // Vive no SERVIDOR, e não só no agente, porque a frota é heterogênea: a
      // correção do aparelho só vale para quem atualizar, e o agente velho
      // continuaria contaminando por meses.
      //
      // O evento fica; some só o que não dá para afirmar. Sem duração e sem fim
      // ele vale zero segundo e o rollup o descarta — mas o fato de ter havido
      // exibição, e a hora em que começou, continuam registrados.
      const TETO_SEGUNDOS = 3600 + 300; // a hora cheia, com folga para atraso de fila
      const bruto = Number(e.duration_seconds);
      const fim = e.ended_at ? String(e.ended_at) : null;
      const intervalo = fim
        ? (Date.parse(fim) - Date.parse(startedAt)) / 1000
        : Number.NaN;
      const longoDemais =
        (Number.isFinite(bruto) && bruto > TETO_SEGUNDOS) ||
        (Number.isFinite(intervalo) && intervalo > TETO_SEGUNDOS);
      const dur = longoDemais ? NaN : bruto;
      // Vídeo que já saiu da biblioteca ainda vira linha: o nome do arquivo é
      // menos do que o nome de cadastro, mas é infinitamente mais do que um
      // buraco no histórico de exibição.
      const mediaUrl = kind === "media_play" && e.media_url ? String(e.media_url) : null;
      const asset = mediaUrl ? porUrl.get(mediaUrl) : undefined;
      return {
        tenant_id: device.tenant_id,
        device_id: device.id,
        event_id: eventId,
        kind,
        package: e.package ? String(e.package).slice(0, 120) : null,
        started_at: startedAt,
        // Fim também sai quando o trecho é longo demais: deixá-lo era manter
        // exatamente o campo que o relatório lê primeiro.
        ended_at: longoDemais ? null : fim,
        duration_seconds: Number.isFinite(dur) && dur >= 0 ? Math.round(dur) : null,
        media_id: asset?.id ?? null,
        media_name: asset?.name ?? (mediaUrl ? nomeDaUrl(mediaUrl) : null),
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
