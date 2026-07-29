"use client";

import Link from "next/link";
import { useActionState } from "react";
import { getMessages } from "@/lib/i18n";
import { createStore, type CreateStoreState } from "./actions";

const initial: CreateStoreState = { status: "idle" };

const COUNTRIES = ["BR", "AR", "CL", "CO", "MX", "PE"];
const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Rio_Branco",
  "America/Bahia",
  "America/Buenos_Aires",
  "America/Santiago",
  "America/Bogota",
  "America/Mexico_City",
  "America/Lima",
];

const fieldClass =
  "rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

export function StoreForm({ chains }: { chains: { id: string; name: string }[] }) {
  const t = getMessages();
  const [state, action, pending] = useActionState(createStore, initial);

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">{t.stores.name}</span>
        <input name="name" required className={fieldClass} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.stores.code}</span>
          <input name="code" placeholder="SPC0000" className={fieldClass} />
          <span className="text-xs text-muted">{t.stores.codeHint}</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.stores.chain}</span>
          <select name="chain_id" defaultValue="" className={fieldClass}>
            <option value="">—</option>
            {chains.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.stores.kind}</span>
          <select name="kind" defaultValue="shopping" className={fieldClass}>
            <option value="shopping">{t.stores.kindShopping}</option>
            <option value="street">{t.stores.kindStreet}</option>
            <option value="other">{t.stores.kindOther}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.stores.city}</span>
          <input name="city" className={fieldClass} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.stores.state}</span>
          <input name="state" maxLength={2} placeholder="SP" className={fieldClass} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.stores.country}</span>
          <select name="country" defaultValue="BR" className={fieldClass}>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.stores.timezone}</span>
          <select name="timezone" defaultValue="America/Sao_Paulo" className={fieldClass}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>

        {/* Não é detalhe de cadastro: é o que separa "vitrine exposta" de
            "vídeo rodando para a loja vazia" no relatório. */}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.stores.opensAt}</span>
          <input type="time" name="opens_at" defaultValue="09:00" className={fieldClass} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t.stores.closesAt}</span>
          <input type="time" name="closes_at" defaultValue="22:00" className={fieldClass} />
        </label>
      </div>

      <p className="-mt-2 text-xs text-muted">{t.stores.hoursHint}</p>

      {state.status === "dup" && (
        <span className="text-sm text-danger">{t.stores.dup}</span>
      )}
      {state.status === "error" && (
        <span className="text-sm text-danger">{t.stores.error}</span>
      )}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? t.stores.creating : t.stores.create}
        </button>
        <Link href="/lojas" className="text-sm text-muted hover:underline">
          {t.stores.back}
        </Link>
      </div>
    </form>
  );
}
