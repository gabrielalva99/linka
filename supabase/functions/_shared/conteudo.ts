// LINKA — o que o aparelho deve exibir, montado num lugar só.
//
// POR QUE EXISTE ESTE ARQUIVO. Duas funções precisam da MESMA resposta:
//   - agent-content entrega o conteúdo;
//   - agent-heartbeat calcula a revisão dela para dizer "mudou / não mudou".
//
// Se cada uma montasse a sua versão, bastaria alguém acrescentar um campo em uma
// e esquecer da outra para o heartbeat parar de enxergar aquele tipo de mudança —
// e o sintoma seria o pior possível: a vitrine simplesmente não atualiza, sem
// erro, sem log, sem nada no painel. Com um builder só, isso é impossível por
// construção: a revisão é o hash EXATO do que vai ser entregue.
//
// É a mesma lição da lista de COMMANDS do heartbeat, que já custou um botão que
// nunca funcionou: informação duplicada em dois lugares vira buraco silencioso
// no dia em que alguém mexe só num deles.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Os campos de `devices` que entram na resposta. Quem consulta o aparelho é a
// função chamadora (ela já faz esse SELECT por outros motivos), então a lista
// mora aqui para as duas pedirem a mesma coisa.
export const CAMPOS_DO_APARELHO =
  "id, tenant_id, idle_return_seconds, volume_percent, agent_version, cleanup_enabled, cleanup_time, block_settings, stores(opens_at, closes_at)";

export type AparelhoParaConteudo = {
  id: string;
  tenant_id: string;
  idle_return_seconds: number | null;
  volume_percent: number | null;
  cleanup_enabled: boolean | null;
  cleanup_time: string | null;
  block_settings: boolean | null;
  stores: { opens_at: string; closes_at: string } | { opens_at: string; closes_at: string }[] | null;
};

export async function montarConteudo(
  supabase: SupabaseClient,
  device: AparelhoParaConteudo,
) {
  // Quem decide o que toca é o banco: vídeo fixo do aparelho > campanha mais
  // específica, no fuso da loja.
  const { data: rows } = await supabase.rpc("resolve_device_content", {
    p_device_id: device.id,
  });
  const resolved = Array.isArray(rows) ? rows[0] : null;
  const contentUrl: string | null = resolved?.out_url ?? null;

  // Lista para baixar: a campanha inteira (o rodízio não pode esperar download).
  let prefetch: string[] = contentUrl ? [contentUrl] : [];
  if (resolved?.out_campaign_id) {
    const { data: items } = await supabase
      .from("campaign_items")
      .select("position, media_assets(url)")
      .eq("campaign_id", resolved.out_campaign_id)
      .order("position");
    const urls = (items ?? [])
      .map((i: { media_assets: { url: string } | { url: string }[] | null }) => {
        const rel = i.media_assets;
        return Array.isArray(rel) ? rel[0]?.url : rel?.url;
      })
      .filter((u): u is string => typeof u === "string" && u.length > 0);
    if (urls.length > 0) prefetch = urls;
  }

  // Versão atual do app: o aparelho decide se precisa se atualizar.
  const { data: release } = await supabase
    .from("agent_releases")
    .select("version, url")
    .eq("is_current", true)
    .maybeSingle();

  // Horário da loja vai para o aparelho: com a loja aberta, tela apagada é
  // vitrine morta e ele precisa acordar sozinho. Com a loja fechada, ninguém
  // vai passar na frente e insistir só gasta bateria e queima a tela.
  const loja = Array.isArray(device.stores) ? device.stores[0] : device.stores;

  // PIN de manutenção: vai como HASH, nunca em claro.
  //
  // O aparelho não precisa do número — precisa saber se o que foi digitado na
  // tela confere. Mandando o hash, o PIN da rede inteira não fica escrito em
  // aparelho nenhum, e ler a memória de um aparelho não entrega a chave dos
  // outros 249.
  //
  // Isto não transforma seis dígitos em segredo forte: quem tiver o hash e
  // paciência testa o milhão de combinações fora do aparelho. O que protege de
  // verdade é o conjunto — bloqueio após 3 erros na tela, religar automático em
  // 5 minutos e registro em audit_log a cada saída. O hash só evita o caso fácil.
  //
  // Vem de tenant_secrets, e não de tenants: a política de leitura de tenants
  // libera a própria linha para qualquer pessoa da marca, então o PIN guardado lá
  // era legível pelo cliente pela API — tela fechada com coluna aberta. Aqui a
  // service role passa por cima do RLS; no painel, só o superadmin alcança.
  const { data: segredo } = await supabase
    .from("tenant_secrets")
    .select("maintenance_pin")
    .eq("tenant_id", device.tenant_id)
    .maybeSingle();
  const pinEfetivo: string | null = segredo?.maintenance_pin ?? null;
  let pinHash: string | null = null;
  if (pinEfetivo) {
    pinHash = await sha256(pinEfetivo);
  }

  return {
    content_url: contentUrl,
    store_opens_at: String(loja?.opens_at ?? "09:00").slice(0, 5),
    store_closes_at: String(loja?.closes_at ?? "22:00").slice(0, 5),
    fit: resolved?.out_fit ?? "zoom",
    prefetch,
    // Comportamento do aparelho vem do servidor: ajustar não exige novo APK.
    idle_return_seconds: device.idle_return_seconds ?? 30,
    volume_percent: device.volume_percent ?? 0,
    block_settings: device.block_settings ?? false,
    cleanup_enabled: device.cleanup_enabled ?? true,
    cleanup_time: String(device.cleanup_time ?? "23:00").slice(0, 5),
    // Quem decide "estou atualizado" é o aparelho (ele conhece as duas pontas);
    // o servidor comparando com o cache dava "atualizado" logo após instalar.
    current_version: release?.version ?? null,
    // Manda sempre: quem compara versões (e recusa rebaixar) é o agente.
    agent_update: release ? { version: release.version, url: release.url } : null,
    // Nulo = sem saída presencial. O agente falha fechado: sem hash, o gesto
    // escondido responde "saída não configurada" em vez de destravar.
    maintenance_pin_sha256: pinHash,
  };
}

// A REVISÃO: impressão digital do conteúdo entregue.
//
// O aparelho guarda a revisão do que já aplicou e manda de volta a cada batida.
// O servidor recalcula e responde só "mudou: sim/não". Nada de data de alteração,
// que erra nos dois sentidos — relógio de aparelho fora de hora, e mudança que
// vai e volta ao valor original (trocar a campanha e desfazer) marcando novidade
// que não existe.
//
// Repare no que ela cobre de graça: campanha por horário. Quando dá a hora de
// virar, resolve_device_content passa a devolver outro vídeo, o hash muda
// sozinho, e a virada chega ao aparelho sem ninguém programar nada.
export async function revisaoDe(conteudo: unknown): Promise<string> {
  // Chaves em ordem fixa: JSON.stringify preserva a ordem de inserção do objeto,
  // e como o objeto sempre nasce do mesmo literal acima, a ordem é estável entre
  // as duas funções. O que não pode é alguém montar o objeto campo a campo em
  // ordem diferente — por isso montarConteudo é o único lugar que o constrói.
  return (await sha256(JSON.stringify(conteudo))).slice(0, 16);
}

async function sha256(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(texto),
  );
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
