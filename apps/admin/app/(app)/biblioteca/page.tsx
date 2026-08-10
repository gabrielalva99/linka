import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { podeOperarAgora } from "@/lib/perms";
import { emOperacao, getActiveTenant, porCliente, tenantFilter } from "@/lib/tenant";
import { CONTENT_FIT_HINTS, type ContentFit } from "@linka/shared";
import { FitToggle } from "./fit-toggle";
import { DeleteButton } from "./delete-button";
import { VariantPicker } from "./variant-picker";
import { UploadForm } from "./upload-form";
import { Busca } from "./busca";
import { Paginacao } from "./paginacao";
import { data } from "@/lib/datas";
import { tamanho } from "@/lib/numeros";

type MediaRow = {
  id: string;
  name: string;
  url: string;
  size_bytes: number | null;
  created_at: string;
  fit_mode: ContentFit;
  width: number | null;
  height: number | null;
  variant_of: string | null;
};





/** Peças por página. As versões de cada uma acompanham, sem contar no limite. */
const POR_PAGINA = 20;

export default async function BibliotecaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; p?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const filtro = await tenantFilter();
  const sp = await searchParams;
  const busca = (sp.q ?? "").trim();
  const paginaPedida = Math.max(1, Number(sp.p ?? 1) || 1);

  const [{ data: mediaData }, { data: deviceData }, { data: emCampanha }] =
    await Promise.all([
    // TETO EXPLÍCITO, e a busca acontece no BANCO.
    //
    // Sem limite a API corta em 1000 linhas por padrão, em silêncio — o mesmo
    // teto que já mordeu na tela de lojas. Peça além disso não aparecia, e
    // ninguém percebe a ausência de algo que nunca foi mostrado.
    //
    // O limite é alto de propósito: a lista é montada em CONJUNTOS (peça +
    // versões), e paginar no banco cortaria uma peça no meio das versões dela.
    // Com um pack real de 14 arquivos, 2000 linhas comportam ~140 campanhas —
    // e quando isso apertar, o aviso na tela diz que está apertando, em vez de
    // sumir com material em silêncio.
    porCliente(
      (() => {
        const q = supabase
          .from("media_assets")
          .select(
            "id, name, url, size_bytes, created_at, fit_mode, width, height, variant_of",
          );
        if (!busca) return q;

        // BUSCAR UM FORMATO PROCURA PELA RESOLUÇÃO, e não pelo nome do arquivo.
        //
        // Digitar "1080x1272" é o jeito natural de procurar um formato — e por
        // nome não achava nada, porque o arquivo real se chama
        // "..._1080 x 1272.mp4", com espaços. O primeiro pack da agência veio com
        // as duas grafias no mesmo lote, então nome é justamente o campo em que
        // não dá para confiar.
        //
        // A resolução está em colunas próprias, lida do arquivo no envio. Quando
        // a busca tem cara de formato, é por elas que se procura.
        const formato = busca.match(/^(\d{3,5})\s*[x×]\s*(\d{3,5})$/i);
        if (formato) {
          return q.eq("width", Number(formato[1])).eq("height", Number(formato[2]));
        }
        return q.ilike("name", `%${busca}%`);
      })(),
      filtro,
    )
      .order("created_at", { ascending: false })
      .limit(2000),
    // Quem está exibindo cada vídeo AGORA. Arquivado não exibe nada: contá-lo
    // fazia o vídeo parecer no ar em mais aparelhos do que a realidade.
    emOperacao(
      supabase.from("devices").select("id, name, content_url"),
      filtro,
    ).not("content_url", "is", null),
    // E quem está dentro de CAMPANHA.
    //
    // Faltava, e a tela mentia por isso: com a campanha "Geral" ativa tocando dois
    // vídeos, a biblioteca dizia "Sem uso" nos dois. Quem confia nisso clica em
    // Excluir para limpar a casa e tenta apagar o que está no ar na loja agora. O
    // banco recusa (a chave estrangeira é RESTRICT), então não vira desastre —
    // vira um erro sem explicação, que é a outra forma de perder a confiança.
    //
    // Conta só campanha ATIVA: peça de campanha pausada não está no ar, e tratar
    // as duas igual travaria a limpeza de material antigo para sempre.
    porCliente(
      supabase
        .from("campaign_items")
        .select("media_id, campaigns!inner(name, is_active)")
        .eq("campaigns.is_active", true),
      filtro,
    ),
  ]);

  const t = getMessages();
  const podeOperar = await podeOperarAgora();
  // O caminho do arquivo no armazenamento começa pelo cliente, e é disso que a
  // política de escrita do storage depende para saber quem pode enviar.
  const tenantAtivo = (await getActiveTenant())?.id ?? null;
  const media = (mediaData ?? []) as MediaRow[];
  const devices = (deviceData ?? []) as {
    id: string;
    name: string;
    content_url: string;
  }[];

  // Quem está exibindo o quê — evita apagar um vídeo que está no ar em loja.
  //
  // Guarda o id junto do nome porque o aviso "em uso em: razr 663E" era a única
  // informação da tela sem caminho: a pessoa vê que o vídeo está no ar, decide
  // conferir o aparelho, e tinha que decorar o nome e ir procurar na frota.
  const usedBy = new Map<string, { id: string; name: string }[]>();
  for (const d of devices) {
    usedBy.set(d.content_url, [
      ...(usedBy.get(d.content_url) ?? []),
      { id: d.id, name: d.name },
    ]);
  }

  // A LISTA VIRA CONJUNTOS, e não catorze linhas soltas.
  //
  // O primeiro pack real da agência tem catorze arquivos da MESMA peça, um por
  // formato de tela. Listados lado a lado, a biblioteca vira uma parede em que
  // ninguém acha nada e todos parecem campanhas diferentes. Aninhados sob a peça
  // a que pertencem, catorze linhas viram uma — e fica evidente quais formatos
  // aquela campanha já cobre.
  const variantesPor = new Map<string, MediaRow[]>();
  for (const m of media) {
    if (!m.variant_of) continue;
    variantesPor.set(m.variant_of, [...(variantesPor.get(m.variant_of) ?? []), m]);
  }

  // A BUSCA PODE ACHAR SÓ A VERSÃO.
  //
  // Procurar "1080x1272" casa com o nome do arquivo daquele formato, e não com o
  // da peça a que ele pertence. Como a tela só desenha peças principais, o
  // resultado sumia: a busca encontrava algo e mostrava lista vazia — o pior
  // resultado possível, porque parece que a peça não existe.
  //
  // Busca os pais que faltam, numa consulta só. Sem busca ativa isso nem roda,
  // porque a lista completa já traz todo mundo.
  let principaisNaLista = media.filter((m) => !m.variant_of);
  if (busca) {
    const idsNaLista = new Set(principaisNaLista.map((m) => m.id));
    const paisFaltando = [
      ...new Set(
        media
          .filter((m) => m.variant_of && !idsNaLista.has(m.variant_of))
          .map((m) => m.variant_of as string),
      ),
    ];
    if (paisFaltando.length > 0) {
      const { data: pais } = await porCliente(
        supabase
          .from("media_assets")
          .select(
            "id, name, url, size_bytes, created_at, fit_mode, width, height, variant_of",
          )
          .in("id", paisFaltando),
        filtro,
      );
      principaisNaLista = [...principaisNaLista, ...((pais ?? []) as MediaRow[])].sort(
        (a, b) => (a.created_at < b.created_at ? 1 : -1),
      );
    }
  }
  const todasPrincipais = principaisNaLista;

  // A PÁGINA CONTA PEÇAS, NÃO LINHAS.
  //
  // Um pack do Dia dos Pais é uma peça e treze versões. Paginar por linha
  // cortaria o conjunto ao meio — a peça numa página, metade das versões na
  // seguinte — e o que a tela promete é justamente mostrar o conjunto inteiro
  // junto. Vinte peças por página valem vinte cartões, cada um com as versões
  // dele dentro.
  const totalPaginas = Math.max(1, Math.ceil(todasPrincipais.length / POR_PAGINA));
  const pagina = Math.min(paginaPedida, totalPaginas);
  const principais = todasPrincipais.slice(
    (pagina - 1) * POR_PAGINA,
    pagina * POR_PAGINA,
  );
  // Bateu no teto da consulta: material pode estar faltando da lista, e isso
  // precisa ser dito. Silêncio aqui é a tela mentindo por omissão.
  const truncou = media.length >= 2000;
  // Só peça principal pode receber variantes, e uma peça que já tem variantes não
  // pode virar variante de outra (o banco recusa os dois casos). Oferecer na tela
  // o que o banco vai recusar é ensinar a desconfiar do painel.
  // AS OPÇÕES SAEM DA PÁGINA, e não da biblioteca inteira.
  //
  // Antes, cada linha recebia a lista de todas as peças: com 200 vídeos eram 200
  // seletores de 200 opções, e escolher num menu de 200 nomes truncados é
  // impraticável de qualquer forma. Com a busca acima, achar a peça certa é
  // filtrar por nome — aí ela e a candidata aparecem na mesma página.
  const opcoesPara = (id: string) =>
    variantesPor.get(id)?.length
      ? []
      : principais.filter((p) => p.id !== id).map((p) => ({ id: p.id, name: p.name }));

  // Campanhas ativas que usam cada vídeo, por id.
  const campanhasDoVideo = new Map<string, string[]>();
  for (const linha of (emCampanha ?? []) as {
    media_id: string;
    campaigns: { name: string } | { name: string }[] | null;
  }[]) {
    const c = Array.isArray(linha.campaigns) ? linha.campaigns[0] : linha.campaigns;
    if (!c?.name) continue;
    const atuais = campanhasDoVideo.get(linha.media_id) ?? [];
    if (!atuais.includes(c.name)) {
      campanhasDoVideo.set(linha.media_id, [...atuais, c.name]);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold">{t.library.title}</h1>
      <p className="mt-1 text-sm text-muted">{t.library.subtitle}</p>

      {/* Sem isto, o único caminho para abastecer a biblioteca era a tela de um
          aparelho — que aplica o vídeo nele junto. Subir uma campanha de catorze
          formatos significava aplicar catorze vídeos num aparelho ao acaso. */}
      {podeOperar && tenantAtivo && (
        <div className="mt-6">
          <UploadForm tenantId={tenantAtivo} />
        </div>
      )}
      {/* Sem cliente selecionado o envio não tem para onde ir — o caminho do
          arquivo começa pelo cliente. Dizer isso é melhor que sumir com o
          formulário e deixar a pessoa procurando onde envia. */}
      {podeOperar && !tenantAtivo && (
        <p className="mt-6 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
          {t.library.noTenant}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Busca inicial={busca} />
        {todasPrincipais.length > 0 && (
          <span className="text-xs text-muted">
            {t.library.found.replace("{n}", String(todasPrincipais.length))}
          </span>
        )}
      </div>

      {truncou && (
        <p className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
          {t.library.tooMany.replace("{n}", "2000")}
        </p>
      )}

      {media.length === 0 ? (
        <p className="mt-8 rounded-xl border border-line bg-surface p-6 text-sm text-muted">
          {busca ? t.library.noResults : t.library.empty}
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {principais.map((m) => {
            const users = usedBy.get(m.url) ?? [];
            const campanhas = campanhasDoVideo.get(m.id) ?? [];
            const variantes = variantesPor.get(m.id) ?? [];
            return (
              <li
                key={m.id}
                className="rounded-xl border border-line bg-surface p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="mt-1 text-xs text-muted">
                      {tamanho(m.size_bytes)} · {data(m.created_at)}
                      {m.width && m.height ? (
                        <>
                          {" · "}
                          <span className="font-mono">
                            {m.width}×{m.height}
                          </span>
                        </>
                      ) : null}
                    </p>
                    {/* "Sem uso" só quando é verdade nos DOIS caminhos que levam
                        um vídeo à vitrine: fixado num aparelho e dentro de campanha
                        ativa. Antes olhava só o primeiro, e um vídeo tocando numa
                        campanha ativa aparecia como "Sem uso" — convite para apagar
                        o que está no ar na loja. */}
                    {campanhas.length > 0 && (
                      <p className="mt-2 text-xs text-success">
                        {t.library.inCampaign}: {campanhas.join(", ")}
                      </p>
                    )}
                    {users.length > 0 ? (
                      <p className="mt-1 text-xs text-success">
                        {t.library.inUse}:{" "}
                        {users.map((u, i) => (
                          <span key={u.id}>
                            {i > 0 && ", "}
                            <Link href={`/dispositivos/${u.id}`} className="hover:underline">
                              {u.name}
                            </Link>
                          </span>
                        ))}
                      </p>
                    ) : (
                      campanhas.length === 0 && (
                        <p className="mt-2 text-xs text-muted">{t.library.unused}</p>
                      )
                    )}
                  </div>
                  {podeOperar && <DeleteButton mediaId={m.id} name={m.name} />}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                  <span className="text-xs text-muted">{t.library.fit}</span>
                  <FitToggle mediaId={m.id} value={m.fit_mode} />
                  <span className="text-xs text-muted">
                    {CONTENT_FIT_HINTS[m.fit_mode]}
                  </span>
                </div>

                {/* OS OUTROS FORMATOS DESTA MESMA PEÇA.
                    A campanha aponta só para o arquivo de cima; na entrega, cada
                    aparelho recebe o daqui que combina com a tela dele. */}
                {variantes.length > 0 && (
                  <div className="mt-4 border-t border-line pt-4">
                    <p className="text-xs font-medium text-muted">
                      {t.library.otherFormats.replace("{n}", String(variantes.length))}
                    </p>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {variantes.map((v) => (
                        <li
                          key={v.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2"
                        >
                          <span className="min-w-0 truncate text-xs">{v.name}</span>
                          <span className="flex items-center gap-3">
                            {v.width && v.height ? (
                              <span className="font-mono text-xs text-muted">
                                {v.width}×{v.height}
                              </span>
                            ) : (
                              <span className="text-xs text-warning">
                                {t.library.noSize}
                              </span>
                            )}
                            {podeOperar && (
                              <VariantPicker
                                mediaId={v.id}
                                atual={v.variant_of}
                                opcoes={opcoesPara(v.id)}
                                temDimensao={Boolean(v.width && v.height)}
                              />
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Só oferece transformar em variante quem ainda não é dona de
                    outras: peça com filhas viraria um segundo nível, que o banco
                    recusa. Sem opção nenhuma, o seletor some em vez de aparecer
                    vazio. */}
                {podeOperar && opcoesPara(m.id).length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
                    <VariantPicker
                      mediaId={m.id}
                      atual={null}
                      opcoes={opcoesPara(m.id)}
                      temDimensao={Boolean(m.width && m.height)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Paginacao pagina={pagina} total={totalPaginas} busca={busca} />
    </div>
  );
}
