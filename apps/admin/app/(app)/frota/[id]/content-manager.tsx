"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMessages } from "@/lib/i18n";
import { addMedia, assignContent } from "./actions";

type Media = { id: string; name: string; url: string };

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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${tenantId}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from("content")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        setError(t.device.uploadError);
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
      <form action={assignContent} className="flex items-end gap-2">
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
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          {t.device.apply}
        </button>
      </form>

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
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  );
}
