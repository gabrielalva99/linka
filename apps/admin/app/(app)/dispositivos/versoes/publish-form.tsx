"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { publishRelease, type PublishState } from "./actions";
import { tamanho } from "@/lib/numeros";

const inicial: PublishState = { ok: null };

/**
 * O botão diz QUEM vai receber, e não "publicar".
 *
 * Quem publica está olhando para o botão, não para o seletor três campos acima.
 * Escrever o alvo no próprio botão é o que separa "subir uma versão de teste na
 * TV" de "mexer nos 250 aparelhos que estão em loja agora".
 */
const QUEM_RECEBE: Record<string, { botao: string; aviso: string }> = {
  todos: {
    botao: "Publicar para todos os aparelhos",
    aviso: "Vai para a frota inteira, de todos os clientes.",
  },
  smartphone: {
    botao: "Publicar só para os celulares",
    aviso: "Vai só para os celulares. As TVs continuam como estão.",
  },
  tv: {
    botao: "Publicar só para as TVs",
    aviso: "Vai só para as TVs. Os celulares continuam como estão.",
  },
};
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
  // "todos" e não vazio: o valor precisa aparecer escrito na tela antes de
  // alguém publicar. Alvo em branco lido como "a frota inteira" é o tipo de
  // padrão que só é descoberto depois de atingir os 250 aparelhos.
  const [alvo, setAlvo] = useState("todos");
  const [erro, setErro] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const versaoRef = useRef<HTMLInputElement>(null);

  /**
   * Traduz a recusa do Storage para algo acionavel.
   *
   * So diz "superadmin" quando o servidor de fato recusou por permissao. O resto
   * sai com o motivo que veio, porque quem esta na tela precisa saber se troca de
   * conta, troca de arquivo ou espera a rede voltar.
   */
  function motivoDoEnvio(error: { message?: string; statusCode?: string }): string {
    const codigo = String(error.statusCode ?? "");
    const texto = (error.message ?? "").toLowerCase();
    const semPermissao = codigo === "403" || codigo === "401" ||
      texto.includes("row-level security") || texto.includes("unauthorized") ||
      texto.includes("violates");
    if (semPermissao) {
      return "Envio recusado: publicar versão é só do superadmin, e esta conta não é. Entre com a conta de superadmin da plataforma.";
    }
    if (codigo === "413" || texto.includes("too large") || texto.includes("exceeded")) {
      return "Arquivo grande demais para o limite do Storage.";
    }
    return `Não foi possível enviar: ${error.message ?? "erro desconhecido"}`;
  }

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
        // A CAUSA REAL, e não a mais provável.
        //
        // Aqui estava escrito "Só o superadmin pode publicar versões" para
        // QUALQUER falha. Acertava quando era permissão e mentia no resto —
        // arquivo grande, rede caindo, bucket errado — mandando procurar no
        // lugar errado. Mensagem que chuta a causa custa mais tempo do que
        // mensagem que não diz nada.
        setErro(motivoDoEnvio(error));
        setEnviando(false);
        return;
      }
      const { data } = supabase.storage.from("releases").getPublicUrl(path);
      setUrl(data.publicUrl);
      setArquivo(`${file.name} · ${tamanho(file.size)}`);
    } catch (e) {
      // Idem: o que estourou vai para a tela. "Não foi possível" sozinho manda a
      // pessoa adivinhar.
      setErro(`Não foi possível enviar o arquivo: ${e instanceof Error ? e.message : String(e)}`);
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
        <label className="flex flex-col gap-1.5 sm:w-48">
          <span className="text-sm text-muted">Para quais aparelhos</span>
          <select
            name="target_device_type"
            value={alvo}
            onChange={(e) => setAlvo(e.target.value)}
            className={field}
          >
            <option value="todos">Todos os aparelhos</option>
            <option value="smartphone">Só os celulares</option>
            <option value="tv">Só as TVs</option>
          </select>
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
          {pending ? "Publicando…" : QUEM_RECEBE[alvo].botao}
        </button>
        <span className="text-xs text-muted">
          {QUEM_RECEBE[alvo].aviso} Eles baixam sozinhos no próximo contato (até
          1 minuto).
        </span>
      </div>

      {erro && <p className="mt-3 text-xs text-warning">{erro}</p>}
      {state.ok === false && (
        <p className="mt-3 text-xs text-warning">{state.error}</p>
      )}
      {state.ok === true && (
        <p className="mt-3 text-xs text-success">
          {state.version} publicada. Os aparelhos atualizam sozinhos.
        </p>
      )}
    </form>
  );
}
