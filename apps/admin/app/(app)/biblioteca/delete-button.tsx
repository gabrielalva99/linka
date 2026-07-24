"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { deleteMedia } from "./actions";

/** Exclui um vídeo da biblioteca, com confirmação e bloqueio se estiver em uso. */
export function DeleteButton({ mediaId, name }: { mediaId: string; name: string }) {
  const t = getMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(t.library.confirmDelete.replace("{name}", name))) return;
          setError(null);
          startTransition(async () => {
            const result = await deleteMedia(mediaId);
            if (result.ok) router.refresh();
            else if (result.reason === "in_use") {
              setError(t.library.inUseBlock.replace("{n}", String(result.count)));
            } else setError(t.library.deleteError);
          });
        }}
        className="rounded-md border border-line px-3 py-1.5 text-xs text-muted transition hover:border-danger hover:text-danger disabled:opacity-60"
      >
        {pending ? t.library.deleting : t.library.delete}
      </button>
      {error && <span className="text-right text-xs text-danger">{error}</span>}
    </div>
  );
}
