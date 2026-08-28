// LINKA — Edge Function: a API que o bot da loja consome.
//
// POR QUE ELA EXISTE. Em 25/08 o aviso por e-mail saiu às 13h41 e o aparelho
// ficou quase seis horas apagado, porque quem podia plugar o cabo não recebe
// e-mail. Avisar não é o suficiente: precisa chegar em quem age, e voltar
// dizendo o que aconteceu.
//
// O QUE ELA NÃO FAZ. Não manda mensagem, não guarda telefone e não sabe o que é
// WhatsApp. Isso é do bot. Aqui mora só o que o LINKA sabe: o que precisa de
// gente, como o aparelho está agora, e o que a loja respondeu.
//
// A separação é de propósito. Canal de mensagem muda; o modelo de dados não
// pode ser arrastado junto toda vez que mudar.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const RESPOSTAS = new Set(["voltou", "nao_voltou", "erro", "sem_resposta"]);

Deno.serve(async (req) => {
  const supabase = createClient(url, serviceKey);

  // A guarda: os dois lados leem do mesmo cofre, então não existe valor
  // duplicado para alguém esquecer de trocar. Mesmo desenho de agent-push e
  // alertas-avisar.
  const { data: guarda } = await supabase.rpc("ler_segredo", { p_nome: "bot_guarda" });
  if (!guarda || req.headers.get("x-linka-guarda") !== guarda) {
    return json({ error: "sem_guarda" }, 401);
  }

  const rota = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";

  // ── O QUE PRECISA DE GENTE AGORA ────────────────────────────────────────
  // GET /bot-api/alertas
  // GET /bot-api/alertas?atencao=1          também o que pode esperar
  // GET /bot-api/alertas?loja=SPC7613       só uma loja
  //
  // O padrão é só o crítico, porque é o que vira mensagem para a loja. O
  // `atencao=1` existe para o bot olhar o quadro inteiro sem que isso incomode
  // ninguém: aparelho que cai às 22h30 não é urgente até a loja abrir, mas você
  // quer poder ver que ele caiu.
  if (req.method === "GET" && rota === "alertas") {
    const q = new URL(req.url).searchParams;
    const { data, error } = await supabase.rpc("alertas_para_o_bot", {
      p_incluir_atencao: q.get("atencao") === "1" || q.get("atencao") === "true",
      p_loja: q.get("loja")?.trim() || null,
    });
    if (error) return json({ error: "falha_ao_listar", detalhe: error.message }, 500);
    return json({ alertas: data ?? [] });
  }

  // ── COMO ESTE APARELHO ESTÁ NESTE INSTANTE ──────────────────────────────
  // GET /bot-api/aparelho?code=010
  if (req.method === "GET" && rota === "aparelho") {
    const code = new URL(req.url).searchParams.get("code")?.trim();
    if (!code) return json({ error: "informe_code" }, 400);
    const { data, error } = await supabase.rpc("aparelho_para_o_bot", { p_code: code });
    if (error) return json({ error: "falha_ao_ler", detalhe: error.message }, 500);
    const linha = (data ?? [])[0];
    if (!linha) return json({ error: "aparelho_nao_encontrado" }, 404);
    return json(linha);
  }

  // ── A PESSOA APARECEU NO BOT ────────────────────────────────────────────
  // POST /bot-api/vincular  { celular, id, canal? }
  //
  // Cadastrar diz QUEM é a pessoa; isto diz POR ONDE falar com ela. No Telegram
  // o chat_id só existe depois que ela toca em Iniciar, então este é o único
  // momento em que dá para gravá-lo, e é o bot quem o tem na mão.
  if (req.method === "POST" && rota === "vincular") {
    let corpo: Record<string, unknown>;
    try {
      corpo = await req.json();
    } catch {
      return json({ error: "json_invalido" }, 400);
    }
    const vinculo = String(corpo.vinculo ?? "").trim();
    const celular = String(corpo.celular ?? "").trim();
    const canal = String(corpo.canal ?? "telegram");
    const id = String(corpo.id ?? "").trim();
    if (!id) return json({ error: "informe_id" }, 400);
    if (!vinculo && !celular) return json({ error: "informe_vinculo_ou_celular" }, 400);

    // PELO CÓDIGO É O CAMINHO BOM.
    //
    // Ele vem no `?start=` do link do Telegram, aponta para uma pessoa só e vale
    // uma vez. O bot não pergunta nada, e some a chance de alguém digitar um
    // número diferente do que cadastrou e o vínculo nunca acontecer.
    if (vinculo) {
      const { data, error } = await supabase.rpc("vincular_por_codigo", {
        p_vinculo: vinculo,
        p_canal: canal,
        p_id: id,
      });
      if (error) return json({ error: "falha_ao_vincular", detalhe: error.message }, 500);
      const r = (data ?? {}) as { ok?: boolean; nome?: string; erro?: string };
      return json({
        ok: r.ok === true,
        nome: r.nome ?? null,
        // Código já usado e código vencido dão o mesmo recado: os dois se
        // resolvem do mesmo jeito, refazendo o cadastro.
        recado: r.ok
          ? null
          : "Esse codigo nao vale mais. Abra o link de cadastro da loja de novo.",
      });
    }

    // PELO CELULAR é o caminho de trás, para quem se cadastrou antes de o código
    // existir ou chegou ao bot por fora do link.
    const { data, error } = await supabase.rpc("registrar_id_no_canal", {
      p_celular: celular,
      p_canal: canal,
      p_id: id,
    });
    if (error) return json({ error: "falha_ao_vincular", detalhe: error.message }, 500);

    const r = (data ?? {}) as { ok?: boolean; contatos?: number };
    // Distingue "vinculei" de "não achei esse número no cadastro", para o bot
    // poder responder "não encontrei, você chegou a abrir o link de cadastro?"
    // em vez de dar tudo certo e a pessoa nunca receber nada.
    return json({
      ok: r.ok === true,
      contatos: r.contatos ?? 0,
      recado: r.ok
        ? null
        : "Nao encontrei esse numero no cadastro. Abra o link de cadastro da loja primeiro.",
    });
  }

  // ── SAIR ────────────────────────────────────────────────────────────────
  // POST /bot-api/sair  { id, canal? }
  //
  // A política de privacidade promete remoção imediata a quem responder SAIR.
  // Desliga pelo canal e não pelo telefone: quem está indo embora não deve ter
  // que informar nada de novo.
  if (req.method === "POST" && rota === "sair") {
    let corpo: Record<string, unknown>;
    try {
      corpo = await req.json();
    } catch {
      return json({ error: "json_invalido" }, 400);
    }
    const id = String(corpo.id ?? "").trim();
    if (!id) return json({ error: "informe_id" }, 400);

    const { data, error } = await supabase.rpc("desligar_contato", {
      p_canal: String(corpo.canal ?? "telegram"),
      p_id: id,
    });
    if (error) return json({ error: "falha_ao_sair", detalhe: error.message }, 500);

    const r = (data ?? {}) as { ok?: boolean; contatos?: number };
    return json({
      ok: true,
      removido: r.ok === true,
      // Responde ok mesmo quando não achou: quem pediu para sair não precisa
      // saber se estava cadastrado, e insistir seria o oposto do que ele pediu.
      recado: "Pronto, voce nao vai mais receber avisos. Para voltar, abra o link de cadastro da loja de novo.",
    });
  }

  // ── O QUE A LOJA RESPONDEU ──────────────────────────────────────────────
  // POST /bot-api/triagem  { alert_id, resposta, texto?, quem?, canal? }
  if (req.method === "POST" && rota === "triagem") {
    let corpo: Record<string, unknown>;
    try {
      corpo = await req.json();
    } catch {
      return json({ error: "json_invalido" }, 400);
    }

    let alertId = String(corpo.alert_id ?? "").trim();
    const aparelho = String(corpo.aparelho ?? "").trim();
    const resposta = String(corpo.resposta ?? "").trim();
    if (!alertId && !aparelho) {
      return json({ error: "informe_alert_id_ou_aparelho" }, 400);
    }
    if (!RESPOSTAS.has(resposta)) {
      return json({ error: "resposta_invalida", aceitas: [...RESPOSTAS] }, 400);
    }

    // ACEITA O CÓDIGO DO APARELHO, e não é conveniência.
    //
    // No caso BOM o alerta já fechou quando a resposta chega: a pessoa arruma,
    // o aparelho volta, o relógio fecha o alerta, e só então ela escreve "já
    // arrumei". Aí `/alertas` não devolve mais aquele id e o bot fica sem
    // referência, perdendo justamente a conversa que mais interessa registrar.
    //
    // Resolve pelo alerta mais recente daquele aparelho, aberto ou fechado.
    if (!alertId) {
      const { data: achado } = await supabase
        .from("device_alerts")
        .select("id, devices!inner(code)")
        .eq("devices.code", aparelho)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!achado) return json({ error: "aparelho_sem_alerta" }, 404);
      alertId = achado.id as string;
    }

    const { data: alerta } = await supabase
      .from("device_alerts")
      .select("id, tenant_id, closed_at, devices(code)")
      .eq("id", alertId)
      .maybeSingle();
    if (!alerta) return json({ error: "alerta_nao_encontrado" }, 404);

    const rel = (alerta as { devices: unknown }).devices as
      | { code: string }
      | { code: string }[]
      | null;
    const code = (Array.isArray(rel) ? rel[0]?.code : rel?.code) ?? null;

    // CONFERE ANTES DE ACREDITAR, e é o ponto desta rota.
    //
    // "Já voltou" dito por quem está com pressa não é o mesmo que o aparelho
    // reportando. Sem esta checagem, o botão vira um jeito de tirar o alerta da
    // frente, e o painel volta a mentir — que é exatamente o problema que os
    // avisos existem para resolver.
    let estado: Record<string, unknown> | null = null;
    if (code) {
      const { data: agora } = await supabase.rpc("aparelho_para_o_bot", { p_code: code });
      estado = (agora ?? [])[0] ?? null;
    }
    const noAr = estado?.no_ar === true;
    const exibindo = estado?.exibindo === true;

    const { error: erroGrava } = await supabase.from("alerta_triagem").insert({
      alert_id: alertId,
      tenant_id: alerta.tenant_id,
      resposta,
      texto: typeof corpo.texto === "string" ? corpo.texto.slice(0, 2000) : null,
      quem: typeof corpo.quem === "string" ? corpo.quem.slice(0, 120) : null,
      canal: typeof corpo.canal === "string" ? corpo.canal.slice(0, 40) : null,
      conferido_no_ar: estado ? noAr : null,
    });
    if (erroGrava) {
      return json({ error: "falha_ao_gravar", detalhe: erroGrava.message }, 500);
    }

    // A LOJA DISSE QUE VOLTOU E O APARELHO DISCORDA.
    //
    // Devolvido como campo próprio para o bot poder responder na hora, em vez de
    // encerrar a conversa e a gente descobrir horas depois que não voltou nada.
    const contradiz = resposta === "voltou" && !(noAr && exibindo);

    return json({
      ok: true,
      registrado: resposta,
      // Diz em qual alerta caiu. Quando o bot manda pelo codigo do aparelho,
      // ele nao sabe qual foi escolhido, e precisa saber para nao registrar
      // duas respostas no mesmo alerta achando que sao coisas diferentes.
      alert_id: alertId,
      // O alerta fecha sozinho quando o aparelho volta, pelo relógio de 5
      // minutos. Esta rota nunca fecha alerta: quem decide é a telemetria, não
      // a conversa.
      alerta_aberto: alerta.closed_at == null,
      estado_agora: estado,
      contradiz_a_telemetria: contradiz,
      recado: contradiz
        ? "O aparelho ainda nao esta reportando aqui. Pode conferir se ele esta ligado e na tomada?"
        : null,
    });
  }

  return json({
    error: "rota_desconhecida",
    rotas: [
      "GET /alertas (?atencao=1, ?loja=CODIGO)",
      "GET /aparelho?code=",
      "POST /vincular",
      "POST /triagem (alert_id ou aparelho)",
      "POST /sair",
    ],
  }, 404);
});
