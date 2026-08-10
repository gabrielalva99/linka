// LINKA — Edge Function: heartbeat do agente.
// O aparelho reporta status/bateria/modo periodicamente, autenticando com o device_token
// (header Authorization: Bearer <token> ou campo device_token no corpo).
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

const STATUS = new Set(["provisioning", "online", "degraded", "offline"]);
const MODE = new Set([
  "not_running",
  "main_menu",
  "show",
  "protection",
  "sleep",
  "alarm",
]);
const FIT = new Set(["zoom", "fit"]);
const CONNECTION = new Set(["wifi", "cellular", "ethernet", "none"]);
const COMMANDS = new Set([
  "deprovision",
  "debug_probe",
  "debug_off",
  "debug_on",
  "cleanup_now",
  "lock_probe",
  "clear_password",
  "inventory_now",
  // Faltava, e o botão "Tentar de novo" do painel não funcionava por causa disso:
  // o comando entrava na fila, o servidor o considerava desconhecido, filtrava da
  // resposta e ele ficava preso para sempre. O agente já sabia executar; o
  // caminho até ele é que estava cortado. Toda entrada nova aqui é obrigatória —
  // esta lista é o que decide o que chega ao aparelho.
  "update_retry",
]);

/** Mesma normalização do agent-provision: "motorola edge 30 ultra" ≡ "Moto Edge 30 Ultra". */
function modelKey(s: string) {
  return s.toLowerCase().replace(/motorola|moto\b/g, "").replace(/[^a-z0-9]/g, "");
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
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const token = bearer || String(payload.device_token ?? "");
  if (!token) return json({ error: "missing_token" }, 401);

  const supabase = createClient(url, serviceKey);

  const { data: device } = await supabase
    .from("devices")
    .select(`model_id, pending_command, push_token, ${CAMPOS_DO_APARELHO}`)
    .eq("device_token", token)
    .maybeSingle();
  if (!device) return json({ error: "invalid_token" }, 401);

  const update: Record<string, unknown> = {
    status: STATUS.has(String(payload.status)) ? payload.status : "online",
    last_seen_at: new Date().toISOString(),
  };
  if (MODE.has(String(payload.mode))) update.mode = payload.mode;
  if (payload.os_version != null) update.os_version = String(payload.os_version);
  if (payload.agent_version != null) update.agent_version = String(payload.agent_version);
  if (payload.battery_level != null) {
    const n = Number(payload.battery_level);
    if (Number.isFinite(n) && n >= 0 && n <= 100) update.battery_level = Math.round(n);
  }
  if (typeof payload.battery_charging === "boolean") {
    update.battery_charging = payload.battery_charging;
  }
  if (typeof payload.synced === "boolean") update.synced = payload.synced;
  // app_updated NÃO é mais aceito. Quem sabe se o aparelho está atualizado é o
  // servidor: ele tem a versão instalada e a publicada. O aparelho respondia
  // isso a partir de um valor em cache e ficava uma batida atrás, então o painel
  // mostrava "1 de 2" com os dois já na versão nova.
  if ("playing_url" in payload) {
    update.playing_url =
      typeof payload.playing_url === "string" && payload.playing_url.length > 0
        ? payload.playing_url
        : null;
  }
  if ("playing_fit" in payload) {
    update.playing_fit = FIT.has(String(payload.playing_fit)) ? payload.playing_fit : null;
  }

  const hardwareModel = payload.hardware_model ? String(payload.hardware_model) : null;
  if (hardwareModel) update.hardware_model = hardwareModel;

  // Saúde do aparelho (REFERENCIA §12.1) — cada campo é opcional e validado.
  if (payload.temperature_c != null) {
    const n = Number(payload.temperature_c);
    if (Number.isFinite(n) && n > -50 && n < 150) update.temperature_c = n;
  }
  if (payload.uptime_seconds != null) {
    const n = Number(payload.uptime_seconds);
    if (Number.isFinite(n) && n >= 0) update.uptime_seconds = Math.round(n);
  }
  if (typeof payload.screen_on === "boolean") update.screen_on = payload.screen_on;
  if (CONNECTION.has(String(payload.connection))) update.connection = payload.connection;
  if (payload.signal_dbm != null) {
    const n = Number(payload.signal_dbm);
    if (Number.isFinite(n) && n > -200 && n < 0) update.signal_dbm = Math.round(n);
  }

  // TAMANHO DA TELA ATUAL. Em dobrável isto MUDA quando o aparelho abre, e é por
  // isso que chega na batida em vez de no provisionamento: um Razr medido aberto
  // e exposto fechado receberia o criativo da tela interna, que corta 47% na
  // externa. Opcional — agente que não reporta cai na resolução do modelo.
  if (payload.screen_width != null && payload.screen_height != null) {
    const w = Number(payload.screen_width);
    const h = Number(payload.screen_height);
    if (
      Number.isFinite(w) && Number.isFinite(h) &&
      w > 0 && h > 0 && w < 20000 && h < 20000
    ) {
      update.screen_width = Math.round(w);
      update.screen_height = Math.round(h);
    }
  }

  if (typeof payload.is_device_owner === "boolean") {
    update.is_device_owner = payload.is_device_owner;
  }
  if (typeof payload.kiosk_locked === "boolean") update.kiosk_locked = payload.kiosk_locked;
  // A trava DE VERDADE e a janela de manutencao, separadas do campo acima.
  //
  // kiosk_locked nunca foi a trava do quiosque: e "as travas de rede estao
  // aplicadas". Elas continuam aplicadas durante a manutencao, entao ele dizia
  // "presa" com o aparelho aberto — e, pior, continuaria dizendo "presa" para
  // sempre se o startLockTask() falhasse ao voltar.
  if (typeof payload.lock_task_on === "boolean") update.lock_task_on = payload.lock_task_on;
  if (typeof payload.maintenance_open === "boolean") {
    update.maintenance_open = payload.maintenance_open;
  }
  if (typeof payload.adb_enabled === "boolean") update.adb_enabled = payload.adb_enabled;
  if (typeof payload.blocked_apps === "string") {
    update.blocked_apps = payload.blocked_apps.slice(0, 200);
  }
  // A PROVA de que cada trava está de pé, perguntada ao Android pelo aparelho.
  //
  // Substitui a dedução que o painel fazia a partir do interruptor ligado no
  // painel mais um texto lido com `like`. Nenhum dos dois é a proteção: o
  // primeiro diz o que foi PEDIDO, e o agente chegava a relatar "senha de tela"
  // sem conferir se a trava tinha entrado.
  //
  // Guardado como veio, sem interpretar. Quais travas existem é conhecimento do
  // agente — ele é o único capaz de aplicá-las. Se o servidor filtrasse por uma
  // lista própria, trava nova sumiria em silêncio, que é exatamente o defeito de
  // "a mesma decisão em dois lugares" que já acendeu um alarme falso por dois
  // dias. Só o tamanho é limitado, e chave demais é sinal de defeito, não de uso.
  if (
    payload.protecoes && typeof payload.protecoes === "object" &&
    !Array.isArray(payload.protecoes)
  ) {
    const bruto = payload.protecoes as Record<string, unknown>;
    const limpo: Record<string, boolean> = {};
    for (const [chave, valor] of Object.entries(bruto).slice(0, 40)) {
      if (typeof valor === "boolean") limpo[chave.slice(0, 60)] = valor;
    }
    update.protecoes = limpo;
    update.protecoes_at = new Date().toISOString();
  }
  if (typeof payload.reset_token_ready === "boolean") {
    update.reset_token_ready = payload.reset_token_ready;
  }
  if (typeof payload.screen_lock_set === "boolean") {
    update.screen_lock_set = payload.screen_lock_set;
  }
  // Identidade que sobrevive à restauração de fábrica.
  //
  // Chega pelo heartbeat de propósito: os aparelhos que já estão na rua nunca vão
  // reprovisionar, e é assim que eles aprendem. Sem isto, a proteção contra
  // aparelho fantasma só valeria para aparelho novo.
  const FONTES = new Set(["esid", "serial", "android_id"]);
  if (typeof payload.stable_id === "string" && payload.stable_id.length > 0) {
    update.stable_id = payload.stable_id.slice(0, 120);
    if (FONTES.has(String(payload.stable_id_source))) {
      update.stable_id_source = payload.stable_id_source;
    }
  }

  // Endereço do aparelho no FCM, para o servidor poder chamá-lo.
  //
  // Chega na batida e não num cadastro à parte, pelo mesmo motivo do stable_id: se
  // o servidor perder o endereço, a próxima batida devolve. Atalho que se registra
  // uma vez só some em silêncio — o aparelho continuaria verde no painel, só mais
  // lento, e ninguém reporta isso.
  if (typeof payload.push_token === "string" && payload.push_token.length > 0) {
    const novo = payload.push_token.slice(0, 400);
    if (novo !== device.push_token) {
      update.push_token = novo;
      update.push_token_at = new Date().toISOString();
    }
  }

  // O comando só sai da fila quando o aparelho confirma ter executado.
  const done = payload.command_done ? String(payload.command_done) : null;
  if (done && done === device.pending_command) update.pending_command = null;
  if (payload.command_result != null) {
    update.last_command_result = String(payload.command_result).slice(0, 500);
  }
  // Desistiu de atualizar: o painel precisa dizer por quê, não só "desatualizado".
  if ("update_error" in payload) {
    update.update_error =
      typeof payload.update_error === "string" && payload.update_error.length > 0
        ? payload.update_error.slice(0, 300)
        : null;
  }
  // Faxina: o painel registra o que foi apagado e quando, sem supor nada.
  if (payload.cleanup_result != null) {
    update.last_cleanup_result = String(payload.cleanup_result).slice(0, 500);
    update.last_cleanup_at = new Date().toISOString();
  }

  const { error } = await supabase.from("devices").update(update).eq("id", device.id);
  if (error) return json({ error: "update_failed" }, 500);

  // Saída de manutenção na loja: vira trilha de auditoria.
  //
  // Sem registro, "o aparelho estava destravado quando eu cheguei" fica
  // indistinguível de "a trava falhou sozinha" — e a segunda hipótese joga a
  // culpa no produto. Com trilha, o painel mostra o aparelho, a loja e a hora.
  //
  // Vem pelo heartbeat, e não por endpoint próprio, porque a saída acontece na
  // loja e a rede pode estar ruim: o agente guarda o aviso e ele sai na próxima
  // batida que passar. Um destravamento sem internet não pode virar um
  // destravamento sem registro.
  if (payload.maintenance_exit != null) {
    const detalhe = String(payload.maintenance_exit).slice(0, 200);
    await supabase.rpc("registrar_saida_manutencao", {
      p_device_id: device.id,
      p_detalhe: detalhe.length > 0 ? detalhe : null,
    });
  }

  // QUEDAS DO APLICATIVO, relatadas pelo próprio aparelho.
  //
  // Chegam pela batida em vez de por canal próprio: a batida já vai e volta, e um
  // aparelho que acabou de travar é o último lugar de onde se quer abrir mais
  // conexão. O aparelho só apaga o arquivo local depois desta resposta — se a
  // gravação falhar aqui, o relato volta na próxima.
  //
  // Sem `upsert` por chave: duas quedas iguais em momentos diferentes são dois
  // fatos, e é a repetição que diz que o defeito é sistemático. O agrupamento
  // acontece na leitura, pelo fingerprint.
  if (Array.isArray(payload.quedas) && payload.quedas.length > 0) {
    const linhas = (payload.quedas as Record<string, unknown>[])
      .slice(0, 20)
      .map((q) => {
        const quando = Number(q.ocorreu_em);
        // Relógio do aparelho pode estar errado; data impossível vira o agora do
        // servidor em vez de descartar o relato — a queda aconteceu de qualquer
        // forma, e é ela que importa.
        const valida =
          Number.isFinite(quando) && quando > 1_600_000_000_000 && quando < Date.now() + 86_400_000;
        return {
          tenant_id: device.tenant_id,
          device_id: device.id,
          fingerprint: String(q.fingerprint ?? "desconhecido").slice(0, 200),
          tipo: String(q.tipo ?? "desconhecido").slice(0, 200),
          mensagem: q.mensagem ? String(q.mensagem).slice(0, 500) : null,
          pilha: q.pilha ? String(q.pilha).slice(0, 4000) : null,
          agent_version: q.agent_version ? String(q.agent_version).slice(0, 40) : null,
          os_version: q.os_version ? String(q.os_version).slice(0, 40) : null,
          ocorreu_em: new Date(valida ? quando : Date.now()).toISOString(),
        };
      })
      .filter((l) => l.fingerprint.length > 0);

    if (linhas.length > 0) {
      await supabase.from("device_errors").insert(linhas);
    }
  }

  // Inventário de apps: chega de hora em hora, não a cada batida.
  if (Array.isArray(payload.apps)) {
    const linhas = (payload.apps as Record<string, unknown>[])
      .map((a) => ({
        device_id: device.id,
        tenant_id: device.tenant_id,
        package: String(a.package ?? "").slice(0, 120),
        label: String(a.label ?? "").slice(0, 120) || String(a.package ?? ""),
        version: a.version ? String(a.version).slice(0, 40) : null,
        is_system: a.system === true,
        last_seen_at: new Date().toISOString(),
      }))
      .filter((a) => a.package.length > 0);

    if (linhas.length > 0) {
      await supabase
        .from("device_apps")
        .upsert(linhas, { onConflict: "device_id,package" });
      // App que sumiu do aparelho tem que sumir do painel: senão o inventário
      // vira histórico e ninguém confia mais nele.
      await supabase
        .from("device_apps")
        .delete()
        .eq("device_id", device.id)
        .not("package", "in", `(${linhas.map((a) => a.package).join(",")})`);
    }
  }

  // Aparelho sem modelo no catálogo: tenta ligar sozinho (evita digitar 250 vezes).
  if (!device.model_id && hardwareModel) {
    const { data: models } = await supabase
      .from("device_models")
      .select("id, name")
      .eq("tenant_id", device.tenant_id);
    const key = modelKey(hardwareModel);
    const hits = (models ?? []).filter((m) => modelKey(String(m.name)) === key);
    if (hits.length === 1) {
      await supabase.from("devices").update({ model_id: hits[0].id }).eq("id", device.id);
    }
  }

  // Sem conexão persistente: o comando pendente volta na resposta do heartbeat.
  const pending = device.pending_command ? String(device.pending_command) : null;
  // Comando com alvo ("uninstall:com.exemplo.jogo") não cabe numa lista fixa.
  // "wifi:{...}" leva JSON com nome e senha da rede da loja. A validação é de
  // FORMA, não de conteúdo: nome de rede e senha de loja têm acento, espaço e
  // símbolo à vontade, e uma regex apertada barraria justamente a rede difícil.
  // O que interessa é que o corpo seja um objeto com um ssid não vazio.
  const redeValida = (s: string) => {
    try {
      const o = JSON.parse(s.slice("wifi:".length));
      return typeof o?.ssid === "string" && o.ssid.length > 0;
    } catch {
      return false;
    }
  };
  const valido = pending != null &&
    (COMMANDS.has(pending) ||
      /^uninstall:[a-zA-Z0-9._]+$/.test(pending) ||
      (pending.startsWith("wifi:") && redeValida(pending)));
  const command = done || !pending || !valido ? null : pending;
  // TEM NOVIDADE? O heartbeat responde, e é isto que tirou o aparelho de ficar
  // perguntando por conteúdo sem parar.
  //
  // O RACIOCÍNIO. A batida já acontece a cada 60s de qualquer forma — ela é o
  // "esta loja está no ar?", e aparelho morto não avisa que morreu, então esse
  // canal não tem como deixar de ser periódico. Se ela já vai e volta, mandar
  // junto a impressão digital do conteúdo custa ZERO chamada a mais. O aparelho
  // manda a revisão do que já aplicou, o servidor recalcula a de agora, e só
  // quando diferem é que ele vai buscar.
  //
  // Medido nos 250 aparelhos do piloto:
  //   antes            4,00 chamadas/min/aparelho   43,2 mi/mês
  //   ritmo adaptativo 1,50                         16,2 mi
  //   com isto         1,03                         11,1 mi
  //
  // E o ganho maior nem é o dinheiro: a troca de campanha passa a chegar em até
  // 60 segundos em vez de 120, gastando menos. Ficou mais barato E mais rápido.
  //
  // COMPATIBILIDADE: agente antigo não manda revisão, então nada é calculado e
  // ele continua com o relógio próprio. Ninguém para de funcionar esperando
  // atualização — com bootloader travado na frota, isso não é opcional.
  let conteudoMudou: boolean | undefined;
  if (typeof payload.revisao === "string") {
    const conteudo = await montarConteudo(supabase, device);
    conteudoMudou = (await revisaoDe(conteudo)) !== payload.revisao;
  }

  return json({ ok: true, command, conteudo_mudou: conteudoMudou });
});
