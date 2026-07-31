// LINKA — Edge Function: convidar alguém para o painel.
//
// Existe como função e não como ação do painel porque criar usuário exige a
// chave de serviço, e ela não pode viver no navegador nem no código do site.
//
// verify_jwt LIGADO, ao contrário das funções do aparelho: quem chama aqui é
// PESSOA, com sessão no painel. É a sessão que diz quem está convidando.
//
// ── Falha crítica corrigida em 29/07 ────────────────────────────────────────
// A versão anterior gerava um link de acesso para o e-mail informado SEMPRE,
// inclusive quando a conta já existia, e devolvia esse link no corpo da
// resposta. Como qualquer pessoa com papel de agência pode convidar, bastava
// convidar o e-mail do operador da plataforma (ou de alguém de outro cliente),
// receber o link e entrar como ele. Tomada de conta completa, sem senha, sem
// rastro que parecesse ataque: no registro fica só "convidou fulano".
//
// Agora o link só é gerado para conta CRIADA AGORA. Quem já tem conta já tem
// caminho de entrada — o login manda o próprio link para o próprio e-mail. Dar
// um atalho para a conta de outra pessoa nunca foi convite, era chave.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// A agência concede só papel de leitura. Promover alguém a agência é do
// operador da plataforma, senão o convite vira caminho de escalada de acesso.
const PAPEIS_DA_AGENCIA = new Set(["client", "field"]);
const PAPEIS = new Set(["agency", "client", "field"]);

// Para onde o link pode levar. Sem esta lista, o destino vinha do corpo do
// pedido e ia inteiro para o gerador de link: um convite legítimo podia
// carregar a pessoa para fora do painel.
const DESTINOS = [
  // Endereço definitivo do painel. O site da marca fica no domínio raiz, na
  // Hostinger; aqui só entra o que é painel, e é por isso que a raiz NÃO está
  // nesta lista — link de convite não pode levar para uma página institucional.
  "https://painel.linkaretail.com.br",
  // linka-admin.vercel.app saiu daqui em 31/07, depois de o Gabriel entrar pelo
  // endereço novo e confirmar. Ele continua respondendo (é o endereço interno da
  // Vercel, e não dá para desligar), mas convite nenhum aponta mais para lá.
  "http://localhost:3000",
];

function destinoSeguro(bruto: string): string | undefined {
  if (!bruto) return undefined;
  try {
    const alvo = new URL(bruto);
    const ok = DESTINOS.some((d) => new URL(d).origin === alvo.origin);
    return ok ? alvo.toString() : undefined;
  } catch {
    return undefined;
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

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return json({ error: "sem_sessao" }, 401);
  }

  // Quem convida vem da SESSÃO, nunca do corpo do pedido.
  const comoUsuario = createClient(url, anonKey, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await comoUsuario.auth.getUser();
  if (!user) return json({ error: "sem_sessao" }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "pedido_invalido" }, 400);
  }

  const email = String(payload.email ?? "").trim().toLowerCase();
  const role = String(payload.role ?? "");
  const tenantId = String(payload.tenant_id ?? "");
  const redirectTo = destinoSeguro(String(payload.redirect_to ?? ""));

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "email_invalido" }, 400);
  if (!PAPEIS.has(role)) return json({ error: "papel_invalido" }, 400);
  if (!tenantId) return json({ error: "cliente_invalido" }, 400);

  const admin = createClient(url, serviceKey);

  // Autorização: operador da plataforma pode tudo; agência só no cliente que
  // atende, e só concedendo leitura.
  const { data: perfil } = await admin
    .from("profiles").select("is_superadmin").eq("id", user.id).maybeSingle();
  const ehSuperadmin = perfil?.is_superadmin === true;

  if (!ehSuperadmin) {
    const { data: vinculo } = await admin
      .from("memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (vinculo?.role !== "agency") return json({ error: "sem_permissao" }, 403);
    if (!PAPEIS_DA_AGENCIA.has(role)) return json({ error: "papel_acima_do_seu" }, 403);
  }

  // Procura por e-mail direto no perfil, e não paginando a lista de usuários:
  // a busca antiga só enxergava os mil primeiros e, passando disso, criava conta
  // duplicada para quem já existia.
  const { data: perfilExistente } = await admin
    .from("profiles").select("id").ilike("email", email).maybeSingle();

  let userId = perfilExistente?.id ?? null;
  let criadoAgora = false;

  if (!userId) {
    const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (criado?.user) {
      userId = criado.user.id;
      criadoAgora = true;
    } else {
      // Conta existe no login mas sem perfil (caso raro). Continua sendo conta
      // de outra pessoa: vincula sem gerar link.
      const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const achado = lista?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
      if (!achado) {
        return json({ error: "nao_criou_usuario", detalhe: erroCriar?.message }, 500);
      }
      userId = achado.id;
    }
  }

  // Convidar de novo não duplica acesso: atualiza o papel de quem já tem.
  const { error: erroVinculo } = await admin
    .from("memberships")
    .upsert(
      { user_id: userId, tenant_id: tenantId, role },
      { onConflict: "user_id,tenant_id" },
    );
  if (erroVinculo) return json({ error: "nao_vinculou", detalhe: erroVinculo.message }, 500);

  // O link SÓ existe para conta nova. Ver o comentário do topo: gerar link para
  // conta que já existe é entregar acesso à conta de outra pessoa.
  let link: string | null = null;
  if (criadoAgora) {
    const { data: gerado } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: redirectTo ? { redirectTo } : undefined,
    });
    link = gerado?.properties?.action_link ?? null;
  }

  // ENTREGA O CONVITE.
  //
  // Antes o link era só devolvido para a tela, e alguém tinha que copiar e mandar
  // por fora. Isso é ruim por dois motivos: um link de acesso circulando por
  // WhatsApp fica lá para sempre, e "convidei" virava sinônimo de "gerei um link
  // e torci".
  //
  // A chave vem do cofre, não de variável de ambiente: ela envia e-mail em nome
  // da marca, e não pode morar no repositório nem no painel.
  let emailEnviado = false;
  let erroEmail: string | null = null;
  try {
    const { data: chave } = await admin.rpc("ler_segredo", { p_nome: "resend_api_key" });
    const { data: cliente } = await admin
      .from("tenants").select("name").eq("id", tenantId).maybeSingle();
    const marca = cliente?.name ?? "LINKA";

    if (!chave) throw new Error("chave do Resend ausente no cofre");

    const assunto = link
      ? "Seu acesso ao painel LINKA"
      : `Você recebeu acesso a ${marca} no painel LINKA`;

    // Sem link para conta que já existe: o corpo apenas avisa. Mandar link de
    // entrada para uma conta de outra pessoa seria entregar a conta dela.
    const miolo = link
      ? `<p>Você foi convidado para o painel <strong>LINKA</strong>, no cliente <strong>${marca}</strong>.</p>
         <p style="margin:28px 0">
           <a href="${link}" style="background:#00f24f;color:#000;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;display:inline-block">Entrar no painel</a>
         </p>
         <p style="color:#666;font-size:13px">Este link é pessoal e vale por uma hora. Se expirar, peça um convite novo — não repasse este e-mail.</p>`
      : `<p>Sua conta agora tem acesso ao cliente <strong>${marca}</strong> no painel <strong>LINKA</strong>.</p>
         <p>Entre normalmente com o seu e-mail e senha de sempre.</p>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "LINKA <nao-responda@linkaretail.com.br>",
        to: [email],
        subject: assunto,
        html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111">
                 <div style="font-size:22px;font-weight:700;letter-spacing:-0.5px;margin-bottom:24px">LINKA</div>
                 ${miolo}
                 <hr style="border:none;border-top:1px solid #eee;margin:32px 0">
                 <p style="color:#999;font-size:12px">Se você não esperava este e-mail, pode ignorá-lo.</p>
               </div>`,
      }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 160)}`);
    emailEnviado = true;
  } catch (e) {
    // NÃO derruba o convite: o vínculo já foi criado e a pessoa já tem acesso.
    // O que não pode é a tela dizer "convidado" com o e-mail no chão — por isso o
    // motivo volta na resposta, e o link junto, para o operador poder repassar.
    erroEmail = e instanceof Error ? e.message : String(e);
  }

  await admin.from("audit_log").insert({
    actor_id: user.id,
    tenant_id: tenantId,
    action: "convidar_usuario",
    entity: "membership",
    metadata: { email, papel: role, conta_nova: criadoAgora, email_enviado: emailEnviado },
  });

  return json({ ok: true, link, email, ja_existia: !criadoAgora, email_enviado: emailEnviado, erro_email: erroEmail });
});
