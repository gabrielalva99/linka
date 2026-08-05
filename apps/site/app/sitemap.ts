import type { MetadataRoute } from "next";
import { SITE } from "./site";

/**
 * Duas páginas só, e é justamente por isso que vale ter: num site pequeno o
 * buscador acha tudo rápido, e a política de privacidade — que é o documento
 * que o procurement de uma marca vai procurar — deixa de depender de alguém
 * chegar nela pelo link do rodapé.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE}/privacidade`, changeFrequency: "yearly", priority: 0.5 },
  ];
}
