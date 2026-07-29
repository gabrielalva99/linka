"use client";

import { useActionState, useState } from "react";
import { getMessages } from "@/lib/i18n";
import { inviteUser, type InviteState } from "./actions";

const inicial: InviteState = { ok: null };
const field =
  "rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

/**
 * Convite com link para copiar.
 *
 * O link aparece na tela em vez de sair por e-mail porque o domínio de e-mail
 * ainda não está verificado. Mandar por WhatsApp funciona hoje; esperar o DNS
 * significaria ninguém entrar no painel esta semana.
 */
export function InviteForm({ podeConcederAgencia }: { podeConcederAgencia: boolean }) {
  const t = getMessages();
  const [state, action, pending] = useActionState(inviteUser, inicial);
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface p-5">
      <form action={action} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm text-muted">{t.users.email}</span>
          <input
            name="email"
            type="email"
            required
            placeholder="nome@empresa.com.br"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1.5 sm:w-56">
          <span className="text-sm text-muted">{t.users.access}</span>
          <select name="role" defaultValue="client" className={field}>
            <option value="client">{t.users.roleClient}</option>
            <option value="field">{t.users.roleField}</option>
            {podeConcederAgencia && <option value="agency">{t.users.roleAgency}</option>}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          {pending ? t.users.inviting : t.users.invite}
        </button>
      </form>

      {state.ok === false && (
        <p className="mt-3 text-xs text-warning">{state.error}</p>
      )}

      {/* Pessoa que já tinha conta recebe acesso, mas nenhum link.
          Gerar link de entrada para conta que já existe é entregar a conta dela
          a quem convidou — foi assim que dava para tomar a conta do operador da
          plataforma convidando o e-mail dele. Ela entra pelo login normal, que
          manda o link para o e-mail dela e para mais ninguém. */}
      {state.ok === true && state.jaExistia && (
        <div className="mt-4 rounded-lg border border-line bg-surface p-4">
          <p className="text-sm">{t.users.alreadyHadAccount.replace("{email}", state.email)}</p>
          <p className="mt-1 text-xs text-muted">{t.users.alreadyHadHint}</p>
        </div>
      )}

      {state.ok === true && !state.jaExistia && (
        <div className="mt-4 rounded-lg border border-success/40 bg-success/5 p-4">
          <p className="text-sm text-success">
            {t.users.created.replace("{email}", state.email)}
          </p>
          <p className="mt-1 text-xs text-muted">{t.users.sendLink}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-surface-2 px-3 py-2 text-xs">
              {state.link}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(state.link);
                setCopiado(true);
              }}
              className="shrink-0 rounded-md border border-line px-3 py-2 text-xs hover:bg-surface-2"
            >
              {copiado ? t.users.copied : t.users.copy}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">{t.users.linkExpires}</p>
        </div>
      )}
    </div>
  );
}
