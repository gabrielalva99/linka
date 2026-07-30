"use client";

import { useActionState } from "react";
import Link from "next/link";
import { getMessages } from "@/lib/i18n";
import { LinkaLogo } from "../../linka-logo";
import { login, type LoginState } from "./actions";
import { MagicLink } from "./magic-link";

const initialState: LoginState = { error: null };

export default function LoginPage() {
  const t = getMessages();
  const [state, formAction, pending] = useActionState(login, initialState);

  const errorText =
    state.error === "invalid"
      ? t.login.invalid
      : state.error === "required"
        ? t.login.required
        : null;

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8">
<LinkaLogo className="h-8 w-auto" />
        </div>

        <MagicLink />

        <h1 className="text-lg font-semibold">{t.login.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.login.subtitle}</p>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">{t.login.email}</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">{t.login.password}</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>

          {errorText && (
            <p className="text-sm text-danger" role="alert">
              {errorText}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
          >
            {pending ? t.login.submitting : t.login.submit}
          </button>
        </form>

        {/* Sem este link a tela era um beco: as contas nascem por convite e
            ninguém definiu senha, então bastava a sessão expirar para a pessoa
            ficar de fora sem caminho de volta. */}
        <Link
          href="/esqueci-senha"
          className="mt-6 inline-block text-sm text-muted hover:text-fg hover:underline"
        >
          {t.login.forgot}
        </Link>
      </div>
    </main>
  );
}
