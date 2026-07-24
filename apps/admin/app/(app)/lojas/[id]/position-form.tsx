"use client";

import { useActionState, useEffect, useRef } from "react";
import { getMessages } from "@/lib/i18n";
import { createPosition, type CreatePositionState } from "./actions";

const initial: CreatePositionState = { status: "idle" };

export function PositionForm({ storeId }: { storeId: string }) {
  const t = getMessages();
  const [state, action, pending] = useActionState(createPosition, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "ok") formRef.current?.reset();
  }, [state.status]);

  return (
    <form ref={formRef} action={action} className="flex items-start gap-2">
      <input type="hidden" name="store_id" value={storeId} />
      <div className="flex flex-col gap-1">
        <input
          name="label"
          required
          placeholder={t.positions.label}
          className="w-64 rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
        {state.status === "error" && (
          <span className="text-xs text-danger">{t.positions.error}</span>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? t.positions.adding : t.positions.add}
      </button>
    </form>
  );
}
