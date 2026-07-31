"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMessages } from "@/lib/i18n";
import { addMedia, assignContent, type AssignState } from "./actions";

type Media = { id: string; name: string; url: string };

const initialAssign: AssignState = { ok: false };
const field =
  "rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

export function ContentManager({
  deviceId,
  tenantId,
  currentUrl,
  media,
}: {
  deviceId: string;
  tenantId: string;
  currentUrl: string | null;
  media: Media[];
}) {
  const t = getMessages();
  const router = useRouter();
  const [assignState, assignAction, assignPending] = useActionState(
    assignContent,
    initialAssign,
  );
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    setUploading(true);
    setError(null);
    setUploaded(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${tenantId}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from("content")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        // A mensagem traduzida diz O QUE falhou; o motivo do servidor diz POR QUÊ.
        // Sem o segundo, "falha ao enviar" manda a pessoa tentar de novo para
        // sempre quando o problema é o arquivo, e não a rede.
        setError(`${t.device.uploadError} ${upErr.message}`);
        setUploading(false);
        return;
      }
      const { data } = supabase.storage.from("content").getPublicUrl(path);
      await addMedia({
        deviceId,
        name: file.name,
        path,
        url: data.publicUrl,
        contentType: file.type,
        size: file.size,
      });
      setUploaded(file.name);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      setError(t.device.uploadError);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Escolher da biblioteca */}
      <form action={assignAction} className="flex items-end gap-2">
        <input type="hidden" name="device_id" value={deviceId} />
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm text-muted">{t.device.pickMedia}</span>
          <select name="url" defaultValue={currentUrl ?? ""} className={field}>
            <option value="">{t.device.none}</option>
            {media.map((m) => (
              <option key={m.id} value={m.url}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={assignPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {t.device.apply}
        </button>
      </form>
      {assignState.ok && (
        <span className="-mt-4 text-xs text-success">{t.device.applied}</span>
      )}

      {/* Enviar novo vídeo */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">{t.device.upload}</span>
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          className="text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:text-foreground"
        />
        {uploading && <span className="text-xs text-muted">{t.device.uploading}</span>}
        {uploaded && (
          <span className="text-xs text-success">
            ✓ {uploaded} · {t.device.uploaded}
          </span>
        )}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  );
}
