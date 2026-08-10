"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { dimensoesDoVideo } from "@/lib/midia";
import { addToLibrary, setVariantOf } from "./actions";

type Fila = {
  file: File;
  width: number | null;
  height: number | null;
  estado: "lido" | "enviando" | "pronto" | "erro";
  erro?: string;
  id?: string;
};

/**
 * Envio de vídeos para a biblioteca, vários de uma vez.
 *
 * POR QUE VÁRIOS DE UMA VEZ. Uma campanha por formato de tela não é um arquivo,
 * é um conjunto: o primeiro pack real da agência trouxe CATORZE arquivos da mesma
 * peça. Um por vez, com o navegador aberto, é meia hora de cliques em que basta
 * pular um para a vitrine de um modelo ficar sem versão.
 *
 * A RESOLUÇÃO É LIDA ANTES DE ENVIAR, e aparece na tela. Assim quem envia vê o
 * que o sistema entendeu de cada arquivo antes de qualquer coisa subir — e um
 * arquivo cuja resolução não foi lida fica visível, em vez de virar uma linha
 * silenciosamente incapaz de participar da escolha por formato.
 *
 * O ENVIO É UM POR VEZ, de propósito. Catorze uploads simultâneos de 8 MB numa
 * rede de escritório se atropelam, e o erro que aparece é "falhou" sem dizer
 * qual. Em fila, o progresso é legível e uma falha isolada não derruba o lote.
 */
export function UploadForm({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fila, setFila] = useState<Fila[]>([]);
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [agrupar, setAgrupar] = useState(false);
  const [principal, setPrincipal] = useState<string>("");
  const [resumo, setResumo] = useState<string | null>(null);

  const campo =
    "rounded-md border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary";

  async function escolher(files: FileList | null) {
    if (!files || files.length === 0) return;
    setLendo(true);
    setResumo(null);
    const lidos: Fila[] = [];
    for (const file of Array.from(files)) {
      const d = await dimensoesDoVideo(file);
      lidos.push({
        file,
        width: d?.width ?? null,
        height: d?.height ?? null,
        estado: "lido",
      });
    }
    setFila(lidos);
    // Sugestão de peça principal: a de proporção mais próxima de 20:9, que é o
    // formato mais comum em celular hoje e portanto o que erra menos no aparelho
    // que ninguém previu. É só sugestão — quem envia troca no seletor.
    const comDim = lidos.filter((f) => f.width && f.height);
    if (comDim.length > 0) {
      const alvo = 1080 / 2400;
      const melhor = comDim.reduce((a, b) =>
        Math.abs(a.width! / a.height! - alvo) <= Math.abs(b.width! / b.height! - alvo) ? a : b,
      );
      setPrincipal(melhor.file.name);
      setAgrupar(comDim.length > 1);
    }
    setLendo(false);
  }

  async function enviar() {
    setEnviando(true);
    setResumo(null);
    const supabase = createSupabaseBrowserClient();
    const atual = [...fila];
    const idPorNome = new Map<string, string>();

    for (let i = 0; i < atual.length; i++) {
      atual[i] = { ...atual[i], estado: "enviando" };
      setFila([...atual]);

      const f = atual[i].file;
      try {
        const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${tenantId}/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from("content")
          .upload(path, f, { contentType: f.type, upsert: false });
        if (upErr) throw new Error(upErr.message);

        // A URL não vai daqui: o servidor a deriva do caminho. Mandar a URL do
        // navegador era deixar quem chama decidir onde o arquivo mora.
        const r = await addToLibrary({
          name: f.name,
          path,
          contentType: f.type,
          size: f.size,
          width: atual[i].width ?? undefined,
          height: atual[i].height ?? undefined,
        });
        if (!r.ok) throw new Error(r.error);

        idPorNome.set(f.name, r.id);
        atual[i] = { ...atual[i], estado: "pronto", id: r.id };
      } catch (e) {
        atual[i] = {
          ...atual[i],
          estado: "erro",
          erro: e instanceof Error ? e.message : "falhou",
        };
      }
      setFila([...atual]);
    }

    // AGRUPAR SÓ DEPOIS QUE TUDO SUBIU, e só o que subiu.
    //
    // Ligar durante o envio deixaria o conjunto pela metade se a rede caísse no
    // meio: metade das versões apontando para a peça, metade solta, e ninguém
    // olhando a biblioteca perceberia a diferença.
    let ligadas = 0;
    const idPrincipal = idPorNome.get(principal);
    if (agrupar && idPrincipal) {
      for (const [nome, id] of idPorNome) {
        if (nome === principal) continue;
        const r = await setVariantOf(id, idPrincipal);
        if (r.ok) ligadas++;
      }
    }

    const ok = atual.filter((f) => f.estado === "pronto").length;
    const falhou = atual.filter((f) => f.estado === "erro").length;
    setResumo(
      `${ok} enviado(s)` +
        (ligadas > 0 ? `, ${ligadas} ligado(s) como versão da mesma peça` : "") +
        (falhou > 0 ? ` · ${falhou} falhou(ram)` : ""),
    );
    setEnviando(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  const semDimensao = fila.filter((f) => !f.width || !f.height).length;
  const podeEnviar = fila.length > 0 && !enviando && !lendo;

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="text-sm font-medium">Enviar vídeos</p>
      <p className="mt-1 text-xs text-muted">
        Pode selecionar vários de uma vez. A resolução é lida de cada arquivo.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        multiple
        disabled={enviando || lendo}
        onChange={(e) => escolher(e.target.files)}
        className="mt-3 block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-foreground hover:file:bg-line disabled:opacity-40"
      />

      {lendo && <p className="mt-3 text-xs text-muted">Lendo os arquivos…</p>}

      {fila.length > 0 && (
        <>
          <ul className="mt-4 flex max-h-64 flex-col gap-1 overflow-y-auto">
            {fila.map((f, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-1.5 text-xs"
              >
                <span className="min-w-0 truncate">{f.file.name}</span>
                <span className="flex shrink-0 items-center gap-3">
                  {f.width && f.height ? (
                    <span className="font-mono text-muted">
                      {f.width}×{f.height}
                    </span>
                  ) : (
                    <span className="text-warning">resolução não lida</span>
                  )}
                  {f.estado === "enviando" && <span className="text-muted">enviando…</span>}
                  {f.estado === "pronto" && <span className="text-success">✓</span>}
                  {f.estado === "erro" && (
                    <span className="max-w-48 truncate text-danger" title={f.erro}>
                      {f.erro}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {/* Um arquivo sem resolução sobe e funciona como sempre — só não entra
              na escolha por formato. Dizer isso aqui evita a descoberta tardia,
              olhando uma vitrine que recebeu a peça errada. */}
          {semDimensao > 0 && (
            <p className="mt-2 text-xs text-warning">
              {semDimensao} arquivo(s) sem resolução legível. Eles sobem, mas não
              participam da escolha por formato de tela.
            </p>
          )}

          {fila.filter((f) => f.width && f.height).length > 1 && (
            <div className="mt-4 border-t border-line pt-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={agrupar}
                  onChange={(e) => setAgrupar(e.target.checked)}
                  disabled={enviando}
                  className="size-4 accent-[var(--color-primary)]"
                />
                <span>São versões da mesma peça, em formatos diferentes</span>
              </label>

              {agrupar && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">Peça principal</span>
                  <select
                    value={principal}
                    onChange={(e) => setPrincipal(e.target.value)}
                    disabled={enviando}
                    className={`${campo} max-w-80 text-xs`}
                  >
                    {fila
                      .filter((f) => f.width && f.height)
                      .map((f) => (
                        <option key={f.file.name} value={f.file.name}>
                          {f.width}×{f.height} — {f.file.name}
                        </option>
                      ))}
                  </select>
                  <span className="text-xs text-muted">
                    é ela que a campanha usa, e quem o aparelho recebe quando
                    nenhum formato casa
                  </span>
                </div>
              )}
            </div>
          )}

          <button
            onClick={enviar}
            disabled={!podeEnviar}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            {enviando ? "Enviando…" : `Enviar ${fila.length} arquivo(s)`}
          </button>
        </>
      )}

      {resumo && <p className="mt-3 text-sm text-success">{resumo}</p>}
    </div>
  );
}
