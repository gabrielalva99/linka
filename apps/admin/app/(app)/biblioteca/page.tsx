import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { podeOperarAgora } from "@/lib/perms";
import { emOperacao, porCliente, tenantFilter } from "@/lib/tenant";
import { CONTENT_FIT_HINTS, type ContentFit } from "@linka/shared";
import { FitToggle } from "./fit-toggle";
import { DeleteButton } from "./delete-button";
import { data } from "@/lib/datas";

type MediaRow = {
  id: string;
  name: string;
  url: string;
  size_bytes: number | null;
  created_at: string;
  fit_mode: ContentFit;
};

function humanSize(bytes: number | null): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}



export default async function BibliotecaPage() {
  const supabase = await createSupabaseServerClient();
  const filtro = await tenantFilter();
  const [{ data: mediaData }, { data: deviceData }, { data: emCampanha }] =
    await Promise.all([
    porCliente(
      supabase
        .from("media_assets")
        .select("id, name, url, size_bytes, created_at, fit_mode"),
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

      {media.length === 0 ? (
        <p className="mt-8 rounded-xl border border-line bg-surface p-6 text-sm text-muted">
          {t.library.empty}
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {media.map((m) => {
            const users = usedBy.get(m.url) ?? [];
            const campanhas = campanhasDoVideo.get(m.id) ?? [];
            return (
              <li
                key={m.id}
                className="rounded-xl border border-line bg-surface p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="mt-1 text-xs text-muted">
                      {humanSize(m.size_bytes)} ·{" "}
                      {data(m.created_at)}
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
                            <Link href={`/frota/${u.id}`} className="hover:underline">
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
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
