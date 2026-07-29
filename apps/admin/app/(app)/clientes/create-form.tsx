"use client";

import { useActionState, useEffect, useRef } from "react";
import { createTenant, type CreateTenantState } from "./actions";

const initial: CreateTenantState = { status: "idle" };

export function CreateTenantForm() {
  const [state, action, pending] = useActionState(createTenant, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "ok") formRef.current?.reset();
  }, [state.status]);

  return (
    <form ref={formRef} action={action} className="mt-3 flex items-start gap-2">
      <div className="flex flex-col gap-1">
        <input
          name="name"
          required
          placeholder="Nome da marca (ex.: Claro)"
          className="w-72 rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
        {state.status === "dup" && (
          <span className="text-xs text-danger">Já existe um cliente com esse nome.</span>
        )}
        {state.status === "denied" && (
          <span className="text-xs text-danger">
            Só quem opera a plataforma abre cliente novo.
          </span>
        )}
        {state.status === "error" && (
          <span className="text-xs text-danger">Não consegui criar. Tente de novo.</span>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? "Criando…" : "Criar cliente"}
      </button>
    </form>
  );
}
