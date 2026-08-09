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





export default async function BibliotecaPage() {
  const supabase = await createSupabaseServerClient();
  const filtro = await tenantFilter();
  const [{ data: mediaData }, { data: deviceData }, { data: emCampanha }] =
    await Promise.all([
    porCliente(
      supabase
        .from("media_assets")
        .select(
          "id, name, url, size_bytes, created_at, fit_mode, width, height, variant_of",
        ),
      filtro,
    ).order("created_at", { ascending: false }),
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
  const principais = media.filter((m) => !m.variant_of);
  const variantesPor = new Map<string, MediaRow[]>();
  for (const m of media) {
    if (!m.variant_of) continue;
    variantesPor.set(m.variant_of, [...(variantesPor.get(m.variant_of) ?? []), m]);
  }
  // Só peça principal pode receber variantes, e uma peça que já tem variantes não
  // pode virar variante de outra (o banco recusa os dois casos). Oferecer na tela
  // o que o banco vai recusar é ensinar a desconfiar do painel.
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

      {media.length === 0 ? (
        <p className="mt-8 rounded-xl border border-line bg-surface p-6 text-sm text-muted">
          {t.library.empty}
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
                        Em campanha: {campanhas.join(", ")}
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
                      Outros formatos desta peça ({variantes.length})
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
                                sem resolução
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
    </div>
  );
}
