import Link from "next/link";
import { getMessages } from "@/lib/i18n";

/**
 * Navegação entre páginas, preservando a busca.
 *
 * Sem paginação, a biblioteca trazia a lista inteira e batia no teto de mil
 * linhas da API — em silêncio. Peça além disso simplesmente não aparecia, e
 * ninguém tem como perceber a ausência de algo que nunca foi mostrado.
 */
export function Paginacao({
  pagina,
  total,
  busca,
}: {
  pagina: number;
  total: number;
  busca: string;
}) {
  const t = getMessages();
  if (total <= 1) return null;

  const href = (p: number) => {
    const params = new URLSearchParams();
    if (busca) params.set("q", busca);
    if (p > 1) params.set("p", String(p));
    const qs = params.toString();
    return qs ? `/biblioteca?${qs}` : "/biblioteca";
  };

  const botao =
    "rounded-md border border-line px-3 py-2 text-xs text-muted hover:bg-surface-2";
  const inativo = "rounded-md border border-line px-3 py-2 text-xs text-muted opacity-40";

  return (
    <nav className="mt-6 flex items-center justify-between gap-3">
      {pagina > 1 ? (
        <Link href={href(pagina - 1)} className={botao}>
          {t.library.prev}
        </Link>
      ) : (
        <span className={inativo}>{t.library.prev}</span>
      )}

      <span className="text-xs text-muted">
        {t.library.pageOf
          .replace("{p}", String(pagina))
          .replace("{t}", String(total))}
      </span>

      {pagina < total ? (
        <Link href={href(pagina + 1)} className={botao}>
          {t.library.next}
        </Link>
      ) : (
        <span className={inativo}>{t.library.next}</span>
      )}
    </nav>
  );
}
