"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMessages } from "@/lib/i18n";
import { dimensoesDoVideo } from "@/lib/midia";
import { addToLibrary, setVariantOf } from "./actions";

type Estado = "lido" | "enviando" | "pronto" | "erro";
type Fila = {
  file: File;
  width: number | null;
  height: number | null;
  estado: Estado;
  erro?: string;
  id?: string;
};

/**
 * Envio de vídeos para a biblioteca, vários de uma vez.
 *
 * POR QUE VÁRIOS DE UMA VEZ. Uma campanha por formato de tela não é um arquivo,
 * é um conjunto: o primeiro pack real da agência trouxe CATORZE arquivos da mesma
 * peça. Um por vez é meia hora de cliques em que basta pular um para a vitrine de
 * um modelo ficar sem versão.
 *
 * A RESOLUÇÃO É LIDA ANTES DE ENVIAR e aparece na tela, para quem envia ver o que
 * o sistema entendeu de cada arquivo antes de qualquer coisa subir.
 *
 * O ENVIO É EM FILA, um por vez. Catorze envios simultâneos de 8 MB numa rede de
 * loja se atropelam, e o erro que sobra é "falhou" sem dizer qual.
 */
export function UploadForm({ tenantId }: { tenantId: string }) {
  const t = getMessages();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fila, setFila] = useState<Fila[]>([]);
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [posicao, setPosicao] = useState(0);
  const [agrupar, setAgrupar] = useState(false);
  const [principal, setPrincipal] = useState<string>("");
  const [resumo, setResumo] = useState<{ texto: string; ok: boolean } | null>(null);
  const [avisoGrupo, setAvisoGrupo] = useState<string | null>(null);

  const campo =
    "rounded-md border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary";

  // FECHAR A ABA NO MEIO DO ENVIO PERDE O QUE FALTA.
  //
  // São dois minutos com catorze arquivos numa rede de loja. Sem este aviso, um
  // clique distraído deixa metade do pack no armazenamento e a outra metade não —
  // e a biblioteca fica com um conjunto incompleto que ninguém sabe que está
  // incompleto.
  useEffect(() => {
    if (!enviando) return;
    const segurar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", segurar);
    return () => window.removeEventListener("beforeunload", segurar);
  }, [enviando]);

  async function escolher(files: FileList | null) {
    if (!files || files.length === 0) return;
    setLendo(true);
    setResumo(null);
    setAvisoGrupo(null);
    const lidos: Fila[] = [];
    for (const file of Array.from(files)) {
      const d = await dimensoesDoVideo(file);
      lidos.push({ file, width: d?.width ?? null, height: d?.height ?? null, estado: "lido" });
    }
    // ACUMULA em vez de substituir: quem lembra de mais quatro arquivos depois de
    // escolher catorze não pode perder os catorze sem aviso.
    setFila((atual) => [...atual.filter((f) => f.estado !== "pronto"), ...lidos]);

    // A peça principal é sugerida pela proporção mais próxima de 20:9 — o formato
    // mais comum em celular, o que erra menos no aparelho imprevisto. É sugestão.
    const comDim = lidos.filter((f) => f.width && f.height);
    if (comDim.length > 0 && !principal) {
      const alvo = 1080 / 2400;
      const melhor = comDim.reduce((a, b) =>
        Math.abs(a.width! / a.height! - alvo) <= Math.abs(b.width! / b.height! - alvo) ? a : b,
      );
      setPrincipal(melhor.file.name);
    }
    setLendo(false);
  }

  async function enviar() {
    setEnviando(true);
    setResumo(null);
    setAvisoGrupo(null);
    const supabase = createSupabaseBrowserClient();
    const atual = [...fila];
    const idPorNome = new Map<string, string>();

    for (let i = 0; i < atual.length; i++) {
      // JÁ SUBIU, NÃO SOBE DE NOVO.
      //
      // Sem esta linha, clicar "enviar" depois de uma falha reenviava a fila
      // inteira. Como o caminho leva a hora no nome, não há colisão que segure: o
      // resultado eram treze vídeos duplicados na biblioteca. E clicar de novo é a
      // reação natural de quem vê "1 não subiu".
      if (atual[i].estado === "pronto") continue;

      setPosicao(i + 1);
      atual[i] = { ...atual[i], estado: "enviando", erro: undefined };
      setFila([...atual]);

      const f = atual[i].file;
      try {
        const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${tenantId}/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from("content")
          .upload(path, f, { contentType: f.type, upsert: false });
        // A mensagem do servidor vem em inglês e com nome de tabela e de política.
        // Traduzida por causa: quem está na tela precisa saber o que fazer, não
        // ler "new row violates row-level security policy".
        if (upErr) throw new Error(traduzir(upErr.message));

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
          erro: e instanceof Error ? e.message : t.library.errGeneric,
        };
      }
      setFila([...atual]);
    }

    // AGRUPAR SÓ DEPOIS QUE TUDO SUBIU, e só o que subiu. Ligar durante o envio
    // deixaria o conjunto pela metade se a rede caísse no meio.
    let ligadas = 0;
    const idPrincipal = idPorNome.get(principal);
    if (agrupar && idPrincipal) {
      for (const [nome, id] of idPorNome) {
        if (nome === principal) continue;
        const r = await setVariantOf(id, idPrincipal);
        if (r.ok) ligadas++;
      }
    } else if (agrupar && idPorNome.size > 0) {
      // A PEÇA PRINCIPAL NÃO SUBIU e as versões ficaram soltas na biblioteca.
      // Antes isto passava calado: o resumo dizia "13 enviados, 1 falhou" e não
      // contava que o pack tinha se desfeito.
      setAvisoGrupo(t.library.groupFailed);
    }

    const ok = atual.filter((f) => f.estado === "pronto").length;
    const falhou = atual.filter((f) => f.estado === "erro").length;
    const partes = [t.library.resultSent.replace("{n}", String(ok))];
    if (ligadas > 0) partes.push(t.library.resultGrouped.replace("{n}", String(ligadas)));
    if (falhou > 0) partes.push(t.library.resultFailed.replace("{n}", String(falhou)));
    // Verde só quando nada falhou. Pintar de sucesso "0 enviados · 14 não subiram"
    // é a tela mentindo na cor.
    setResumo({ texto: partes.join(" · "), ok: falhou === 0 });

    setPosicao(0);
    setEnviando(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  function traduzir(bruto: string): string {
    const m = bruto.toLowerCase();
    if (m.includes("row-level security") || m.includes("unauthorized")) {
      return t.library.errNoPermission;
    }
    if (m.includes("already exists") || m.includes("duplicate")) return t.library.errDuplicate;
    if (m.includes("network") || m.includes("failed to fetch")) return t.library.errNetwork;
    // O armazenamento recusa o que não é vídeo. Sem esta linha, quem arrastasse
    // um PDF para a janela veria "não foi possível enviar" e tentaria de novo.
    if (m.includes("mime type") || m.includes("not supported")) return t.library.errFormat;
    return t.library.errGeneric;
  }

  const pendentes = fila.filter((f) => f.estado !== "pronto").length;
  const semDimensao = fila.filter((f) => !f.width || !f.height).length;
  const comDimensao = fila.filter((f) => f.width && f.height);
  const houveFalha = fila.some((f) => f.estado === "erro");
  const podeEnviar = pendentes > 0 && !enviando && !lendo;

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <label htmlFor="linka-upload" className="text-sm font-medium">
        {t.library.uploadTitle}
      </label>
      <p className="mt-1 text-xs text-muted">{t.library.uploadHint}</p>

      <input
        id="linka-upload"
        ref={inputRef}
        type="file"
        accept="video/*"
        multiple
        aria-label={t.library.uploadPick}
        disabled={enviando || lendo}
        onChange={(e) => escolher(e.target.files)}
        className="mt-3 block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:text-foreground hover:file:bg-line disabled:opacity-40"
      />

      {lendo && <p className="mt-3 text-xs text-muted">{t.library.uploadReading}</p>}

      {fila.length > 0 && (
        <>
          {/* Progresso agregado: com catorze arquivos, o item em envio quase
              sempre está fora da área visível da lista. */}
          {enviando && (
            <p className="mt-3 text-xs text-muted" aria-live="polite">
              {t.library.uploadProgress
                .replace("{i}", String(posicao))
                .replace("{n}", String(fila.length))}
            </p>
          )}

          <ul className="mt-3 flex max-h-64 flex-col gap-1 overflow-y-auto">
            {fila.map((f, i) => (
              <li
                key={`${f.file.name}-${i}`}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-surface-2 px-3 py-1.5 text-xs"
              >
                <span className="min-w-0 flex-1 truncate">{f.file.name}</span>
                <span className="flex shrink-0 items-center gap-3">
                  {f.width && f.height ? (
                    <span className="font-mono text-muted">
                      {f.width}×{f.height}
                    </span>
                  ) : (
                    <span className="text-warning">{t.library.uploadNoSize}</span>
                  )}
                  {f.estado === "enviando" && (
                    <span className="text-muted">{t.library.uploadSending}</span>
                  )}
                  {f.estado === "pronto" && (
                    <span className="text-success">✓ {t.library.uploadDone}</span>
                  )}
                </span>
                {f.estado === "erro" && (
                  <span className="w-full text-danger" role="alert">
                    {f.erro}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {semDimensao > 0 && (
            <p className="mt-2 text-xs text-warning">
              {t.library.uploadNoSizeWarn.replace("{n}", String(semDimensao))}
            </p>
          )}

          {comDimensao.length > 1 && (
            <div className="mt-4 border-t border-line pt-4">
              {/* NASCE DESMARCADO, de propósito. Marcado por padrão, quem envia
                  dois vídeos de campanhas diferentes no mesmo lote perde um: ele
                  vira versão do outro e some da lista de peças. */}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={agrupar}
                  onChange={(e) => setAgrupar(e.target.checked)}
                  disabled={enviando}
                  className="size-4 accent-[var(--color-primary)]"
                />
                <span>{t.library.groupLabel}</span>
              </label>

              {agrupar && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label htmlFor="linka-principal" className="text-xs text-muted">
                    {t.library.groupMain}
                  </label>
                  <select
                    id="linka-principal"
                    value={principal}
                    onChange={(e) => setPrincipal(e.target.value)}
                    disabled={enviando}
                    className={`${campo} max-w-80 text-xs`}
                  >
                    {comDimensao.map((f) => (
                      <option key={f.file.name} value={f.file.name}>
                        {f.width}×{f.height} — {f.file.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-muted">{t.library.groupMainHint}</span>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={enviar}
              disabled={!podeEnviar}
              aria-busy={enviando}
              className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
            >
              {enviando
                ? t.library.uploadBtnBusy
                : houveFalha
                  ? t.library.uploadRetryBtn.replace("{n}", String(pendentes))
                  : t.library.uploadBtn.replace("{n}", String(pendentes))}
            </button>
            {!enviando && (
              <button
                onClick={() => {
                  setFila([]);
                  setResumo(null);
                  setAvisoGrupo(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="px-2 py-2.5 text-xs text-muted hover:text-foreground hover:underline"
              >
                {t.library.uploadClear}
              </button>
            )}
          </div>
        </>
      )}

      {avisoGrupo && (
        <p className="mt-3 text-sm text-warning" role="alert">
          {avisoGrupo}
        </p>
      )}
      {resumo && (
        <p
          className={`mt-3 text-sm ${resumo.ok ? "text-success" : "text-warning"}`}
          aria-live="polite"
        >
          {resumo.texto}
        </p>
      )}
    </div>
  );
}
