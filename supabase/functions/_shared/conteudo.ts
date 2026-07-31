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
// construção: a revisão é o hash do que este arquivo monta, e campo novo entra
// nela sozinho. A única coisa deixada de fora é a parte que gira com o relógio
// (content_url e fit), e o porquê está escrito em revisaoDe.
//
// É a mesma lição da lista de COMMANDS do heartbeat, que já custou um botão que
// nunca funcionou: informação duplicada em dois lugares vira buraco silencioso
// no dia em que alguém mexe só num deles.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Os campos de `devices` que entram na resposta. Quem consulta o aparelho é a
// função chamadora (ela já faz esse SELECT por outros motivos), então a lista
// mora aqui para as duas pedirem a mesma coisa.
export const CAMPOS_DO_APARELHO =
  "id, tenant_id, content_fit, idle_return_seconds, volume_percent, agent_version, cleanup_enabled, cleanup_time, block_settings, stores(opens_at, closes_at), tenants(heartbeat_seconds)";

export type AparelhoParaConteudo = {
  id: string;
  tenant_id: string;
  content_fit: string | null;
  idle_return_seconds: number | null;
  volume_percent: number | null;
  cleanup_enabled: boolean | null;
  cleanup_time: string | null;
  block_settings: boolean | null;
  stores: { opens_at: string; closes_at: string } | { opens_at: string; closes_at: string }[] | null;
  tenants:
    | { heartbeat_seconds: number }
    | { heartbeat_seconds: number }[]
    | null;
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

  // A CAMPANHA INTEIRA, NA ORDEM, com o enquadramento de cada vídeo.
  //
  // O aparelho baixa tudo (o rodízio não pode esperar download) E decide sozinho
  // qual é o da vez. Antes ele baixava tudo e mesmo assim PERGUNTAVA ao servidor
  // qual exibir, porque o índice saía de resolve_device_content:
  //
  //     idx := floor(epoch(now()) / rotation_seconds) % total
  //
  // Um rodízio no relógio do servidor só vira no aparelho quando ele pergunta —
  // era essa a razão real da pergunta de 20 em 20 segundos, e foi o que eu quebrei
  // ao subir o intervalo para 120s na 0.51.0: a troca de vídeo passou a atrasar
  // até dois minutos numa campanha de 3. Com a lista e o período na mão, o
  // aparelho vira na hora exata, sem rede, e os aparelhos da mesma loja seguem
  // sincronizados porque a conta é a mesma e parte do mesmo relógio (epoch).
  const playlist: { url: string; fit: string }[] = [];
  let rotationSeconds = 0;
  if (resolved?.out_campaign_id) {
    const { data: items } = await supabase
      .from("campaign_items")
      .select("position, fit_mode, media_assets(url, fit_mode)")
      .eq("campaign_id", resolved.out_campaign_id)
      .order("position");
    for (const i of items ?? []) {
      const linha = i as { fit_mode: string | null; media_assets: unknown };
      const rel = linha.media_assets as
        | { url: string; fit_mode: string | null }
        | { url: string; fit_mode: string | null }[]
        | null;
      const media = Array.isArray(rel) ? rel[0] : rel;
      if (!media || !media.url) continue;
      // Mesma precedência do resolve_device_content, para o aparelho chegar ao
      // mesmo enquadramento que o servidor escolheria.
      playlist.push({
        url: media.url,
        fit: device.content_fit ?? linha.fit_mode ?? media.fit_mode ?? "zoom",
      });
    }
    const { data: campanha } = await supabase
      .from("campaigns")
      .select("rotation_seconds")
      .eq("id", resolved.out_campaign_id)
      .maybeSingle();
    rotationSeconds = Number(campanha?.rotation_seconds ?? 0);
  }
  // Vídeo fixo do aparelho (ou campanha vazia): lista de um, sem rodízio.
  if (playlist.length === 0 && contentUrl) {
    playlist.push({ url: contentUrl, fit: String(resolved?.out_fit ?? "zoom") });
  }
  // prefetch continua sendo só a lista de URLs: é o que os agentes que já estão
  // na rua sabem ler, e aparelho com bootloader travado não pode parar de
  // funcionar esperando atualização.
  const prefetch: string[] = playlist.map((p) => p.url);

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
    // content_url e fit: o vídeo da vez, escolhido pelo relógio do SERVIDOR.
    // Continuam saindo para os agentes antigos, que dependem deles. O agente novo
    // ignora os dois e usa playlist + rotation_seconds.
    content_url: contentUrl,
    fit: resolved?.out_fit ?? "zoom",
    store_opens_at: String(loja?.opens_at ?? "09:00").slice(0, 5),
    store_closes_at: String(loja?.closes_at ?? "22:00").slice(0, 5),
    prefetch,
    playlist,
    rotation_seconds: rotationSeconds,
    // DE QUANTO EM QUANTO TEMPO O APARELHO DIZ "ESTOU AQUI".
    //
    // Vem daqui, e não escrito no aplicativo, porque agora é ajustável: com o
    // push cobrindo comando e conteúdo, a batida ficou responsável só pelo "esta
    // loja está no ar?" — e esse papel aguenta ser lento. Se o número morasse no
    // APK, descobrir que 5 minutos é demais custaria uma versão nova e uma volta
    // na frota inteira.
    //
    // Está no hash de propósito: mudar o ritmo avisa os aparelhos na hora, pelo
    // mesmo caminho da campanha, em vez de valer só para quem for provisionado
    // depois.
    heartbeat_seconds: Number(
      (Array.isArray(device.tenants) ? device.tenants[0] : device.tenants)
        ?.heartbeat_seconds ?? 60,
    ),
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
// virar, resolve_device_content passa a devolver outra campanha, a playlist muda,
// o hash muda sozinho, e a virada chega ao aparelho sem ninguém programar nada.
export async function revisaoDe(conteudo: Record<string, unknown>): Promise<string> {
  // FORA DO HASH: content_url e fit.
  //
  // Não é exceção de conveniência, e a diferença importa. Os dois são função pura
  // de (playlist, rotation_seconds, relógio) — e playlist e rotation_seconds ESTÃO
  // no hash. Nenhuma informação some: qualquer mudança real de conteúdo mexe na
  // playlist. O que sai é só a parte que gira com o relógio.
  //
  // Medido antes de tirar: o aparelho ia buscar conteúdo de 3 em 3 minutos,
  // certinho no rodízio da campanha "Geral" (rotation_seconds = 180). O hash
  // mudava a cada virada porque content_url mudava, e a "novidade" era o servidor
  // avisando de uma troca que o próprio aparelho já sabe fazer.
  //
  // Chaves em ordem fixa: JSON.stringify preserva a ordem de inserção, e o objeto
  // sempre nasce do mesmo literal em montarConteudo — que é o único lugar
  // autorizado a construí-lo, justamente para as duas funções hasharem igual.
  const estavel: Record<string, unknown> = { ...conteudo };
  delete estavel.content_url;
  delete estavel.fit;
  return (await sha256(JSON.stringify(estavel))).slice(0, 16);
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
