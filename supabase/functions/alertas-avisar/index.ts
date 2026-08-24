// LINKA — Edge Function: alerta crítico vira e-mail.
//
// POR QUE ELA EXISTE. Em 22/08 dois aparelhos da loja saíram do ar às 17h50 de
// sábado e voltaram às 11h de segunda. 41 horas. O painel tinha aberto alerta
// crítico nos dois, no minuto certo, e não contou para ninguém: a coluna
// notified_at existia desde julho e nada nunca escrevia nela. Quem descobriu foi
// o vendedor, ao chegar na loja.
//
// O QUE ELA NÃO FAZ. Não detecta nada. Quem detecta é sync_device_alerts, num
// cron separado, de propósito: se o Resend cair, a vigilância da frota não pode
// cair junto. Aqui só se lê o que ficou sem aviso e se manda o e-mail.
//
// SE FALHAR, NÃO PERDE. O carimbo de "avisei" só é gravado depois que o Resend
// confirma. Enquanto não gravar, a próxima passagem (5 em 5 minutos) tenta de
// novo. Uma hora de Resend fora atrasa o aviso; não apaga nenhum.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAINEL = "https://painel.linkaretail.com.br";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * O nome do problema em português de loja.
 *
 * Mesmo vocabulário do painel. Quem recebe o e-mail às 8h da manhã não tem que
 * traduzir "fora_do_ar" na cabeça antes de entender se precisa ir até lá.
 */
const ROTULO: Record<string, string> = {
  app_removido: "aplicativo removido do aparelho",
  fora_do_ar: "fora do ar",
  tela_vazia: "tela sem vídeo",
  menu_parado: "parado no menu de testes",
  sem_travas: "sem travas",
  senha_de_tela: "senha na tela de bloqueio",
  atualizacao_travada: "atualização travada",
  bateria_baixa: "bateria baixa",
  fora_da_tomada: "fora do carregador",
  quente: "aparelho quente",
  sem_loja: "sem loja definida",
  sem_modelo: "sem modelo cadastrado",
  faxina_sem_permissao: "faxina bloqueada",
  versao_atrasada: "versão antiga do aplicativo",
};

type Pendente = {
  alert_id: string;
  tenant_id: string;
  cliente: string;
  fase: "abriu" | "fechou";
  code: string | null;
  device_name: string | null;
  loja: string | null;
  kind: string;
  detalhe: string | null;
  desde: string;
};

/** Quanto tempo faz, em português curto: "há 41 h", "há 12 min". */
function faz(desde: string): string {
  const min = Math.max(1, Math.round((Date.now() - new Date(desde).getTime()) / 60000));
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

function escapar(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c)
  );
}

function corpo(itens: Pendente[], fase: "abriu" | "fechou"): string {
  const linhas = itens
    .map((i) => {
      const nome = escapar(i.code ? `${i.code} · ${i.device_name ?? ""}`.trim() : (i.device_name ?? "aparelho"));
      const problema = escapar(ROTULO[i.kind] ?? i.kind);
      const detalhe = i.detalhe ? escapar(i.detalhe) : "";
      const loja = escapar(i.loja ?? "sem loja");
      return `<tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee">
          <div style="font-weight:600;font-size:15px">${nome}</div>
          <div style="color:#666;font-size:13px;margin-top:2px">${loja}</div>
          <div style="font-size:14px;margin-top:6px">${problema}${detalhe ? ` · ${detalhe}` : ""}</div>
          ${fase === "abriu" ? `<div style="color:#999;font-size:12px;margin-top:2px">assim ${faz(i.desde)}</div>` : ""}
        </td>
      </tr>`;
    })
    .join("");

  const chamada = fase === "abriu"
    ? `<p style="margin:0 0 4px">${itens.length === 1 ? "Um aparelho precisa" : `${itens.length} aparelhos precisam`} de atenção agora.</p>`
    : `<p style="margin:0 0 4px">${itens.length === 1 ? "Voltou ao normal" : "Voltaram ao normal"} sem precisar de ninguém.</p>`;

  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#111">
    <div style="font-size:22px;font-weight:700;letter-spacing:-0.5px;margin-bottom:24px">LINKA</div>
    ${chamada}
    <table style="width:100%;border-collapse:collapse;margin-top:16px">${linhas}</table>
    <p style="margin:28px 0">
      <a href="${PAINEL}/dispositivos" style="background:#00f24f;color:#000;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;display:inline-block">Abrir o painel</a>
    </p>
    <hr style="border:none;border-top:1px solid #eee;margin:32px 0">
    <p style="color:#999;font-size:12px">Você recebe este aviso porque opera esta conta no painel LINKA.</p>
  </div>`;
}

function assunto(itens: Pendente[], fase: "abriu" | "fechou", cliente: string): string {
  const um = itens[0];
  const problema = ROTULO[um.kind] ?? um.kind;
  if (fase === "fechou") {
    return itens.length === 1
      ? `Resolvido: ${um.code ?? "aparelho"} em ${um.loja ?? cliente}`
      : `Resolvido: ${itens.length} aparelhos em ${cliente}`;
  }
  return itens.length === 1
    ? `${um.code ?? "Aparelho"} ${problema} · ${um.loja ?? cliente}`
    : `${itens.length} aparelhos precisam de atenção · ${cliente}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabase = createClient(url, serviceKey);

  // A guarda: os dois lados leem do mesmo cofre. Sem ela, qualquer um na
  // internet dispara e-mail em nome da marca para a lista inteira.
  const { data: guarda } = await supabase.rpc("ler_segredo", { p_nome: "alertas_guarda" });
  if (!guarda || req.headers.get("x-linka-guarda") !== guarda) {
    return json({ error: "sem_guarda" }, 401);
  }

  const { data: pendentes, error: erroLista } = await supabase.rpc("alertas_pendentes_de_aviso");
  if (erroLista) return json({ error: "falha_ao_listar", detalhe: erroLista.message }, 500);

  const lista = (pendentes ?? []) as Pendente[];
  if (lista.length === 0) return json({ ok: true, enviados: 0, nada: true });

  const { data: chave } = await supabase.rpc("ler_segredo", { p_nome: "resend_api_key" });
  if (!chave) return json({ error: "sem_chave_do_resend" }, 500);

  // UM E-MAIL POR CLIENTE E POR FASE, nunca um por aparelho.
  //
  // No fechamento da loja treze aparelhos saem do ar no mesmo minuto. Treze
  // e-mails idênticos em sequência é o jeito mais rápido de ensinar alguém a
  // ignorar o aviso — e aí o alerta que importa chega numa caixa que ninguém lê.
  const grupos = new Map<string, Pendente[]>();
  for (const p of lista) {
    const chaveGrupo = `${p.tenant_id}|${p.fase}`;
    const atual = grupos.get(chaveGrupo);
    if (atual) atual.push(p);
    else grupos.set(chaveGrupo, [p]);
  }

  let enviados = 0;
  const falhas: string[] = [];

  for (const [chaveGrupo, itens] of grupos) {
    const [tenantId, fase] = chaveGrupo.split("|") as [string, "abriu" | "fechou"];
    try {
      const { data: destinos } = await supabase.rpc("destinatarios_de_alerta", {
        p_tenant: tenantId,
      });
      const emails = ((destinos ?? []) as { email: string }[])
        .map((d) => d.email)
        .filter(Boolean);

      // SEM DESTINATÁRIO NÃO CARIMBA.
      //
      // Carimbar aqui seria dar o alerta por avisado sem ninguém ter recebido, e
      // ele nunca mais voltaria à fila. Cliente sem operador cadastrado é um
      // problema de cadastro, e ele fica visível justamente por isso: o alerta
      // continua pendente até alguém existir para recebê-lo.
      if (emails.length === 0) {
        falhas.push(`${tenantId}: sem destinatario`);
        continue;
      }

      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "LINKA <nao-responda@linkaretail.com.br>",
          to: emails,
          subject: assunto(itens, fase, itens[0].cliente),
          html: corpo(itens, fase),
        }),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 160)}`);

      // SÓ AGORA. O carimbo vem depois da confirmação, nunca antes.
      const { error: erroCarimbo } = await supabase.rpc("marcar_alertas_avisados", {
        p_ids: itens.map((i) => i.alert_id),
        p_fase: fase,
      });
      if (erroCarimbo) throw new Error(`carimbo: ${erroCarimbo.message}`);

      enviados += itens.length;
    } catch (e) {
      // Uma falha não derruba os outros clientes: o que não carimbou volta na
      // próxima passagem.
      falhas.push(`${chaveGrupo}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return json({ ok: falhas.length === 0, enviados, grupos: grupos.size, falhas });
});
