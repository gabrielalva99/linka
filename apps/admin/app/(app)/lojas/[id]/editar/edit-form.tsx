"use client";

import Link from "next/link";
import { useActionState } from "react";
import { getMessages } from "@/lib/i18n";
import { updateStore, type EditStoreState } from "./actions";
import { CodeField } from "../../code-field";

const inicial: EditStoreState = { status: "idle" };

const PAISES = ["BR", "AR", "CL", "CO", "MX", "PE"];
// Rótulo em português: "America/Rio_Branco" não diz nada para quem cadastra
// loja, e escolher fuso errado desloca o relatório inteiro daquela loja.
const FUSOS: [string, string][] = [
  ["America/Sao_Paulo", "São Paulo, Brasília e a maior parte do país"],
  ["America/Manaus", "Manaus e Amazonas"],
  ["America/Rio_Branco", "Acre"],
  ["America/Bahia", "Bahia"],
  ["America/Buenos_Aires", "Buenos Aires"],
  ["America/Santiago", "Santiago"],
  ["America/Bogota", "Bogotá"],
  ["America/Mexico_City", "Cidade do México"],
  ["America/Lima", "Lima"],
];

const campo =
  "rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

export type StoreDefaults = {
  id: string;
  name: string;
  code: string | null;
  chainId: string | null;
  kind: string;
  city: string | null;
  state: string | null;
  country: string;
  timezone: string;
  opensAt: string;
  closesAt: string;
};

export function EditStoreForm({
  store,
  chains,
  aparelhos,
}: {
  store: StoreDefaults;
  chains: { id: string; name: string }[];
  aparelhos: number;
}) {
  const t = getMessages();
  const [state, action, pending] = useActionState(updateStore, inicial);

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="store_id" value={store.id} />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">{t.stores.name}</span>
        <input name="name" defaultValue={store.name} required className={campo} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <CodeField defaultValue={store.code ?? ""} className={campo} />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.stores.chain}</span>
          <select name="chain_id" defaultValue={store.chainId ?? ""} className={campo}>
            <option value="">{t.stores.noChain}</option>
            {chains.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.stores.kind}</span>
          <select name="kind" defaultValue={store.kind} className={campo}>
            <option value="shopping">{t.stores.kindShopping}</option>
            <option value="street">{t.stores.kindStreet}</option>
            <option value="other">{t.stores.kindOther}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.stores.city}</span>
          <input name="city" defaultValue={store.city ?? ""} className={campo} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.stores.state}</span>
          <input
            name="state"
            maxLength={2}
            defaultValue={store.state ?? ""}
            className={campo}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.stores.country}</span>
          <select name="country" defaultValue={store.country} className={campo}>
            {PAISES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm text-muted">{t.stores.timezone}</span>
          <select name="timezone" defaultValue={store.timezone} className={campo}>
            {FUSOS.map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* O horário fica em destaque porque manda no comportamento dos aparelhos,
          não é preenchimento de ficha. */}
      <fieldset className="rounded-xl border border-primary/40 bg-primary/5 p-5">
        <legend className="px-2 text-sm font-medium text-primary">
          {t.stores.hoursTitle}
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">{t.stores.opensAt}</span>
            <input
              type="time"
              name="opens_at"
              defaultValue={store.opensAt.slice(0, 5)}
              className={campo}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">{t.stores.closesAt}</span>
            <input
              type="time"
              name="closes_at"
              defaultValue={store.closesAt.slice(0, 5)}
              className={campo}
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-muted">
          {t.stores.hoursEffect.replace("{n}", String(aparelhos))}
        </p>
      </fieldset>

      {state.status === "dup" && (
        <span className="text-sm text-danger">{t.stores.dup}</span>
      )}
      {state.status === "error" && (
        <span className="text-sm text-danger">{t.stores.hoursError}</span>
      )}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? t.stores.saving : t.stores.save}
        </button>
        <Link href={`/lojas/${store.id}`} className="text-sm text-muted hover:underline">
          {t.stores.cancel}
        </Link>
      </div>
    </form>
  );
}
