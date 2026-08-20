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
  "id, tenant_id, device_type, content_fit, idle_return_seconds, volume_percent, agent_version, cleanup_enabled, cleanup_time, block_settings, screen_width, screen_height, stores(opens_at, closes_at), tenants(heartbeat_seconds), device_models(screen_width, screen_height)";

export type AparelhoParaConteudo = {
  id: string;
  tenant_id: string;
  /** smartphone | tablet | tv | notebook | other — decide qual versão do app é a dele. */
  device_type: string | null;
  content_fit: string | null;
  idle_return_seconds: number | null;
  volume_percent: number | null;
  cleanup_enabled: boolean | null;
  cleanup_time: string | null;
  block_settings: boolean | null;
  screen_width: number | null;
  screen_height: number | null;
  stores: { opens_at: string; closes_at: string } | { opens_at: string; closes_at: string }[] | null;
  tenants:
    | { heartbeat_seconds: number }
    | { heartbeat_seconds: number }[]
    | null;
  device_models?:
    | { screen_width: number | null; screen_height: number | null }
    | { screen_width: number | null; screen_height: number | null }[]
    | null;
};

type Tela = { w: number; h: number };
type Arquivo = {
  url: string;
  fit_mode: string | null;
  width: number | null;
  height: number | null;
};

// DE ONDE SAI O TAMANHO DA TELA, e por que são duas fontes.
//
// O que o APARELHO reporta vem primeiro, e é a única fonte que acerta o
// dobrável: a tela do Razr muda quando ele abre, então medir uma vez no
// provisionamento entregaria o arquivo da tela interna a um aparelho exposto
// fechado — que é justamente o corte de 47% já medido em campo.
//
// A resolução do MODELO é a reserva, e não é provisória: ela vale para a frota
// que já está na rua e não vai atualizar por causa disto, e para o aparelho que
// ainda não bateu nenhuma vez.
//
// Sem nenhuma das duas, devolve null — e null significa "não escolha nada",
// mantendo o comportamento anterior. Formato errado é ruim; vitrine preta porque
// faltou preencher um cadastro é pior.
function telaDoAparelho(device: AparelhoParaConteudo): Tela | null {
  if (device.screen_width && device.screen_height) {
    return { w: device.screen_width, h: device.screen_height };
  }
  const modelo = Array.isArray(device.device_models)
    ? device.device_models[0]
    : device.device_models;
  if (modelo?.screen_width && modelo?.screen_height) {
    return { w: modelo.screen_width, h: modelo.screen_height };
  }
  return null;
}

// QUAL ARQUIVO PARA QUAL TELA.
//
// Exato antes de proporção, de propósito: resolução idêntica dispensa reescala, e
// a frota é hardware de entrada — decodificar 1224x2992 para exibir em 720x1600
// custa CPU que o Moto G06 não tem sobrando.
//
// A proporção entra como segunda opção porque cobre o aparelho que ninguém
// previu. No primeiro pack real, 1080x2400, 1220x2712 e 720x1600 têm a MESMA
// proporção: um arquivo desses serve nos três, e é isso que evita exigir da
// agência um arquivo por aparelho do mundo.
//
// Empate mantém o primeiro da lista, que é a peça principal. Determinístico de
// propósito: escolha que varia entre chamadas mudaria o hash da revisão a cada
// batida, e o aparelho baixaria de novo achando que o conteúdo mudou.
function escolherArquivo(
  principal: Arquivo,
  variantes: Arquivo[],
  tela: Tela | null,
): Arquivo {
  if (!tela) return principal;

  const candidatos = [principal, ...variantes].filter(
    (a) => a.width && a.height && a.url,
  );
  if (candidatos.length === 0) return principal;

  const exato = candidatos.find((a) => a.width === tela.w && a.height === tela.h);
  if (exato) return exato;

  const alvo = tela.w / tela.h;
  let melhor = candidatos[0];
  let menorDiferenca = Math.abs(melhor.width! / melhor.height! - alvo);
  for (const a of candidatos.slice(1)) {
    const d = Math.abs(a.width! / a.height! - alvo);
    // Estritamente menor: empate fica com quem chegou antes.
    if (d < menorDiferenca - 1e-9) {
      melhor = a;
      menorDiferenca = d;
    }
  }
  return melhor;
}

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
  // Peça principal → arquivo que este aparelho vai receber. Serve para o
  // content_url dos agentes antigos chegar à MESMA variante da playlist: dois
  // caminhos entregando arquivos diferentes seria a vitrine trocando de
  // enquadramento sozinha na virada do rodízio.
  const escolhaPorUrlPrincipal = new Map<string, string>();
  const tela = telaDoAparelho(device);
  if (resolved?.out_campaign_id) {
    const { data: items } = await supabase
      .from("campaign_items")
      .select("position, fit_mode, media_assets(id, url, fit_mode, width, height)")
      .eq("campaign_id", resolved.out_campaign_id)
      .order("position");

    // AS VARIANTES DE TODAS AS PEÇAS, NUMA CONSULTA SÓ.
    //
    // Uma consulta por item seria N+1 rodando a cada montagem de conteúdo, por
    // aparelho, na frota inteira. Com 250 aparelhos e uma campanha de 5 peças,
    // são 1.250 consultas onde cabem 250.
    const principais = (items ?? [])
      .map((i) => {
        const rel = (i as { media_assets: unknown }).media_assets;
        const m = Array.isArray(rel) ? rel[0] : rel;
        return (m as { id?: string } | null)?.id;
      })
      .filter((id): id is string => Boolean(id));

    const variantesPorPeca = new Map<string, Arquivo[]>();
    if (principais.length > 0 && tela) {
      // ORDEM FIXA, e isto não é capricho.
      //
      // Sem `order`, o Postgres não promete ordem estável entre chamadas — ela
      // muda depois de um UPDATE ou de um VACUUM. Quando duas variantes empatam
      // em proporção (no primeiro pack real, 1080x2400, 1220x2712 e 720x1600 têm
      // a MESMA), a escolha passaria a depender dessa ordem. E a escolha entra na
      // playlist, que entra no hash da revisão: o aparelho veria "o conteúdo
      // mudou" a cada batida e baixaria o mesmo vídeo para sempre.
      //
      // Medido antes de existir esta linha: 5 chamadas seguidas devolveram a
      // mesma variante. Passou — e passar por sorte é o que faz este defeito
      // chegar à loja em vez de ao teste.
      const { data: variantes } = await supabase
        .from("media_assets")
        .select("url, fit_mode, width, height, variant_of")
        .in("variant_of", principais)
        .order("id");
      for (const v of variantes ?? []) {
        const linha = v as Arquivo & { variant_of: string };
        const lista = variantesPorPeca.get(linha.variant_of) ?? [];
        lista.push(linha);
        variantesPorPeca.set(linha.variant_of, lista);
      }
    }

    for (const i of items ?? []) {
      const linha = i as { fit_mode: string | null; media_assets: unknown };
      const rel = linha.media_assets as
        | (Arquivo & { id: string })
        | (Arquivo & { id: string })[]
        | null;
      const media = Array.isArray(rel) ? rel[0] : rel;
      if (!media || !media.url) continue;

      const escolhido = escolherArquivo(
        media,
        variantesPorPeca.get(media.id) ?? [],
        tela,
      );
      if (escolhido.url !== media.url) {
        escolhaPorUrlPrincipal.set(media.url, escolhido.url);
      }

      // Mesma precedência do resolve_device_content, para o aparelho chegar ao
      // mesmo enquadramento que o servidor escolheria. O fit vem do arquivo
      // ESCOLHIDO: variante feita para esta tela traz o enquadramento dela.
      playlist.push({
        url: escolhido.url,
        fit: device.content_fit ?? linha.fit_mode ?? escolhido.fit_mode ?? "zoom",
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
  //
  // Também escolhe variante. O vídeo fixo é o caminho de exceção — "este aparelho
  // exibe esta peça" — e é exatamente onde alguém pendura o criativo especial de
  // uma tela incomum. Deixar de fora seria falhar no caso que mais precisa.
  if (playlist.length === 0 && contentUrl) {
    let arquivo: Arquivo = {
      url: contentUrl,
      fit_mode: null,
      width: null,
      height: null,
    };
    if (tela) {
      const { data: fixa } = await supabase
        .from("media_assets")
        .select("id, url, fit_mode, width, height")
        .eq("url", contentUrl)
        .is("variant_of", null)
        .maybeSingle();
      if (fixa) {
        // Mesma ordem fixa da playlist, pelo mesmo motivo.
        const { data: vs } = await supabase
          .from("media_assets")
          .select("url, fit_mode, width, height")
          .eq("variant_of", (fixa as { id: string }).id)
          .order("id");
        const escolhido = escolherArquivo(
          fixa as unknown as Arquivo,
          (vs ?? []) as unknown as Arquivo[],
          tela,
        );
        if (escolhido.url !== contentUrl) {
          escolhaPorUrlPrincipal.set(contentUrl, escolhido.url);
        }
        arquivo = escolhido;
      }
    }
    playlist.push({
      url: arquivo.url,
      fit: String(resolved?.out_fit ?? arquivo.fit_mode ?? "zoom"),
    });
  }

  // O vídeo da vez, já trocado pela variante deste aparelho. Os agentes antigos
  // leem só este campo; sem a troca aqui, eles continuariam exibindo o arquivo
  // da peça principal enquanto a playlist entrega outro.
  const urlDaVez = contentUrl
    ? (escolhaPorUrlPrincipal.get(contentUrl) ?? contentUrl)
    : null;
  // prefetch continua sendo só a lista de URLs: é o que os agentes que já estão
  // na rua sabem ler, e aparelho com bootloader travado não pode parar de
  // funcionar esperando atualização.
  const prefetch: string[] = playlist.map((p) => p.url);

  // Versão atual do app: o aparelho decide se precisa se atualizar.
  //
  // Vai o TIPO do aparelho junto porque a versão publicada pode mirar só a TV ou
  // só o celular (20/08). Sem isso, uma tentativa no box de TV arrastaria os 250
  // aparelhos de loja para a mesma versão — publicar deixaria de ser decisão e
  // viraria risco.
  //
  // Quem escolhe é `release_atual` no banco, e não este arquivo: são três
  // chamadores (aqui, a lista do painel e o kit de provisionamento) e a regra
  // espalhada vira três regras que concordam até o dia em que não concordam.
  const { data: escolhida } = await supabase.rpc("release_atual", {
    tipo: device.device_type ?? null,
  });
  const release = Array.isArray(escolhida) ? escolhida[0] : escolhida;

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
    content_url: urlDaVez,
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
  // FORA DO HASH TAMBÉM: agent_update e current_version.
  //
  // ── O EFEITO MANADA (medido na Casas Bahia, 19/08) ────────────────────────
  // Publicar uma versão mudava o hash, o heartbeat respondia "conteúdo mudou"
  // para a frota INTEIRA no mesmo minuto, e os 13 aparelhos saíam para o mesmo
  // arquivo ao mesmo tempo. Resultado medido: 11 com tempo esgotado e ZERO
  // baixando, e o ciclo se repetindo — porque a cada nova rodada todos voltavam
  // juntos. Publicar deixava de ser "avisar" e virava "derrubar a rede da loja".
  //
  // Versão publicada NÃO é conteúdo de vitrine. Tirar daqui não esconde nada: o
  // aparelho continua recebendo `agent_update` toda vez que busca conteúdo — só
  // que agora ele busca no ritmo DELE, e os ritmos são naturalmente diferentes
  // entre aparelhos. A adoção passa a ser espalhada por construção, sem ninguém
  // precisar sortear atraso.
  //
  // O custo é conhecido e aceito: a versão nova chega em até meia hora em vez de
  // em segundos. Meia hora escalonada vale mais que segundos que ninguém
  // consegue completar.
  const estavel: Record<string, unknown> = { ...conteudo };
  delete estavel.content_url;
  delete estavel.fit;
  delete estavel.agent_update;
  delete estavel.current_version;
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
