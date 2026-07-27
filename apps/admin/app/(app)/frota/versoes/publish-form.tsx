"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { publishRelease, type PublishState } from "./actions";

const inicial: PublishState = { ok: null };
const field =
  "rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

/**
 * Envia o APK e publica a versão.
 *
 * O arquivo vai do navegador direto para o Storage: 3,7 MB atravessando uma
 * server action estouraria o limite de payload da Vercel. A server action
 * recebe só a URL — e é ela que decide o que a frota obedece.
 */
export function PublishForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(publishRelease, inicial);
  const [enviando, setEnviando] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const versaoRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    setEnviando(true);
    setErro(null);
    setUrl(null);
    try {
      const supabase = createSupabaseBrowserClient();
      // O nome no Storage vem da versão digitada, não do nome do arquivo: dois
      // "app-release.apk" diferentes se sobrescreveriam sem ninguém perceber.
      const versao = versaoRef.current?.value.trim();
      if (!versao || !/^\d+\.\d+\.\d+$/.test(versao)) {
        setErro("Digite a versão (ex.: 0.17.0) antes de escolher o arquivo.");
        setEnviando(false);
        return;
      }
      const path = `linka-agente-${versao}.apk`;
      const { error } = await supabase.storage
        .from("releases")
        .upload(path, file, {
          contentType: "application/vnd.android.package-archive",
          upsert: true,
        });
      if (error) {
        setErro("Envio recusado. Só o superadmin pode publicar versões.");
        setEnviando(false);
        return;
      }
      const { data } = supabase.storage.from("releases").getPublicUrl(path);
      setUrl(data.publicUrl);
      setArquivo(`${file.name} · ${(file.size / 1048576).toFixed(1)} MB`);
    } catch {
      setErro("Não foi possível enviar o arquivo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      action={(fd) => {
        action(fd);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }}
      className="mt-3 rounded-xl border border-line bg-surface p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1.5 sm:w-32">
          <span className="text-sm text-muted">Versão</span>
          <input
            ref={versaoRef}
            name="version"
            placeholder="0.17.0"
            className={field}
            required
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm text-muted">Novidades desta versão</span>
          <input
            name="notes"
            placeholder="O que muda no aparelho"
            className={field}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".apk,application/vnd.android.package-archive"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
          className="text-sm text-muted file:mr-3 file:rounded-md file:border file:border-line file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-foreground"
        />
        {enviando && <span className="text-xs text-muted">Enviando…</span>}
        {arquivo && !enviando && (
          <span className="text-xs text-success">{arquivo} ✓</span>
        )}
      </div>

      <input type="hidden" name="url" value={url ?? ""} />

      <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
        <button
          type="submit"
          disabled={!url || pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          {pending ? "Publicando…" : "Publicar para a frota"}
        </button>
        <span className="text-xs text-muted">
          Os aparelhos baixam sozinhos no próximo contato (até 1 minuto).
        </span>
      </div>

      {erro && <p className="mt-3 text-xs text-warning">{erro}</p>}
      {state.ok === false && (
        <p className="mt-3 text-xs text-warning">{state.error}</p>
      )}
      {state.ok === true && (
        <p className="mt-3 text-xs text-success">
          {state.version} publicada — a frota atualiza sozinha.
        </p>
      )}
    </form>
  );
}
