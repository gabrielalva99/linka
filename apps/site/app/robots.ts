import type { MetadataRoute } from "next";
import { SITE } from "./site";

/**
 * Sem este arquivo o site não estava proibido de ser indexado, mas também não
 * dizia nada — e o buscador tinha que adivinhar onde procurar as páginas.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
