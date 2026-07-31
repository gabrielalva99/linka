"use client";

import { useActionState, useEffect, useRef } from "react";
import { getMessages } from "@/lib/i18n";
import { createModel, type CreateModelState } from "./actions";

const initial: CreateModelState = { status: "idle" };
const field =
  "rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

export function CreateModelForm() {
  const t = getMessages();
  const [state, action, pending] = useActionState(createModel, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "ok") formRef.current?.reset();
  }, [state.status]);

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-start gap-2">
      <input name="name" required placeholder={t.models.name} className={`${field} w-56`} />
      <input name="line" placeholder={t.models.line} className={`${field} w-48`} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? t.models.adding : t.models.add}
      </button>
      {state.status === "dup" && (
        <span className="w-full text-xs text-danger">{t.models.dup}</span>
      )}
      {state.status === "error" && (
        <span className="w-full text-xs text-danger">{t.models.error}</span>
      )}
    </form>
  );
}
