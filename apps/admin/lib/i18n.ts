/**
 * i18n — LATAM-ready desde o dia 1.
 * Nenhum texto fica fixo no código: tudo vem de messages/<locale>.json.
 * Hoje só pt-BR; adicionar es-419 é criar o arquivo e registrá-lo em `dictionaries`.
 */
import ptBR from "@/messages/pt-BR.json";

export const DEFAULT_LOCALE = "pt-BR" as const;
export const SUPPORTED_LOCALES = ["pt-BR", "es-419"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export type Messages = typeof ptBR;

const dictionaries: Partial<Record<Locale, Messages>> = {
  "pt-BR": ptBR,
};

export function getMessages(locale: Locale = DEFAULT_LOCALE): Messages {
  return dictionaries[locale] ?? ptBR;
}
