"use client";

import { useActionState, useEffect, useRef } from "react";
import { getMessages } from "@/lib/i18n";
import { createChain, type CreateChainState } from "./actions";

const initial: CreateChainState = { status: "idle" };

export function CreateChainForm() {
  const t = getMessages();
  const [state, action, pending] = useActionState(createChain, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "ok") formRef.current?.reset();
  }, [state.status]);

  return (
    <form ref={formRef} action={action} className="flex items-start gap-2">
      <div className="flex flex-col gap-1">
        <input
          name="name"
          required
          placeholder={t.chains.name}
          className="w-64 rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
        {state.status === "dup" && (
          <span className="text-xs text-danger">{t.chains.dup}</span>
        )}
        {state.status === "error" && (
          <span className="text-xs text-danger">{t.chains.error}</span>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? t.chains.creating : t.chains.create}
      </button>
    </form>
  );
}
