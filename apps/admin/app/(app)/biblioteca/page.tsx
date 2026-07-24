import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { CONTENT_FIT_HINTS, type ContentFit } from "@linka/shared";
import { FitToggle } from "./fit-toggle";
import { DeleteButton } from "./delete-button";

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

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default async function BibliotecaPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: mediaData }, { data: deviceData }] = await Promise.all([
    supabase
      .from("media_assets")
      .select("id, name, url, size_bytes, created_at, fit_mode")
      .order("created_at", { ascending: false }),
    supabase.from("devices").select("name, content_url").not("content_url", "is", null),
  ]);

  const t = getMessages();
  const media = (mediaData ?? []) as MediaRow[];
  const devices = (deviceData ?? []) as { name: string; content_url: string }[];

  // Quem está exibindo o quê — evita apagar um vídeo que está no ar em loja.
  const usedBy = new Map<string, string[]>();
  for (const d of devices) {
    usedBy.set(d.content_url, [...(usedBy.get(d.content_url) ?? []), d.name]);
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
                      {dateFmt.format(new Date(m.created_at))}
                    </p>
                    {users.length > 0 ? (
                      <p className="mt-2 text-xs text-success">
                        {t.library.inUse}: {users.join(", ")}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-muted">{t.library.unused}</p>
                    )}
                  </div>
                  <DeleteButton mediaId={m.id} name={m.name} />
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
