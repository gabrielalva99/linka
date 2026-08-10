"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { deleteModel, renameModel } from "./actions";
import Link from "next/link";

/**
 * Linha do modelo: corrigir o nome e excluir com trava.
 *
 * A trava mostra quantos aparelhos usam o modelo antes de recusar. Uma recusa
 * que só diz "não foi possível" faz a pessoa tentar de novo achando que foi
 * falha de rede.
 */
export type TelaReportada = { largura: number; altura: number; aparelhos: number };

export function ModelRow({
  id,
  nome,
  linha,
  telaLargura,
  telaAltura,
  sugestoes = [],
  aparelhos,
  podeEditar,
}: {
  id: string;
  nome: string;
  linha: string | null;
  telaLargura: number | null;
  telaAltura: number | null;
  /** O que os aparelhos deste modelo reportam, do formato mais comum ao menos. */
  sugestoes?: TelaReportada[];
  aparelhos: number;
  podeEditar: boolean;
}) {
  const t = getMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [n, setN] = useState(nome);
  const [l, setL] = useState(linha ?? "");
  const [tw, setTw] = useState(telaLargura ? String(telaLargura) : "");
  const [th, setTh] = useState(telaAltura ? String(telaAltura) : "");
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const campo =
    "rounded-md border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-primary";

  if (editando) {
    return (
      <tr className="bg-surface">
        <td className="px-4 py-2">
          <input value={n} onChange={(e) => setN(e.target.value)} className={campo} autoFocus />
        </td>
        <td className="px-4 py-2">
          <input value={l} onChange={(e) => setL(e.target.value)} className={campo} />
        </td>
        <td className="px-4 py-2">
          <div className="flex items-center gap-1">
            <input
              value={tw}
              onChange={(e) => setTw(e.target.value.replace(/\D/g, ""))}
              placeholder="1080"
              inputMode="numeric"
              className={`${campo} w-20`}
              aria-label={t.models.screenWidth}
            />
            <span className="text-xs text-muted">×</span>
            <input
              value={th}
              onChange={(e) => setTh(e.target.value.replace(/\D/g, ""))}
              placeholder="2400"
              inputMode="numeric"
              className={`${campo} w-20`}
              aria-label={t.models.screenHeight}
            />
          </div>

          {/* O NÚMERO VEM DO APARELHO, e não de uma busca na internet.
              Antes, preencher isto exigia descobrir a resolução do modelo em
              algum lugar e digitar — e a tela não dizia nem para que servia o
              campo. Desde a 0.76.0 o próprio aparelho informa a tela em que a
              vitrine aparece; a sugestão é só mostrar o que ele já disse.

              Mostra TODOS os formatos reportados, e não só o mais comum: um
              dobrável exposto aberto e outro fechado reportam telas diferentes, e
              é uma escolha de operação decidir qual vale — não do painel. */}
          {sugestoes.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs text-muted">{t.models.screenFromDevices}</span>
              {sugestoes.map((s) => (
                <button
                  key={`${s.largura}x${s.altura}`}
                  type="button"
                  onClick={() => {
                    setTw(String(s.largura));
                    setTh(String(s.altura));
                  }}
                  disabled={pending}
                  className="rounded-md border border-primary/40 px-2 py-1 text-xs text-primary hover:bg-primary/10 disabled:opacity-40"
                >
                  {s.largura}×{s.altura}
                  <span className="ml-1 text-muted">
                    ({s.aparelhos === 1
                      ? t.models.screenOneDevice
                      : t.models.screenNDevices.replace("{n}", String(s.aparelhos))})
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted">{t.models.screenNoReport}</p>
          )}
          <p className="mt-1 text-xs text-muted">{t.models.screenWhy}</p>
          <p className="text-xs text-muted">{t.models.screenBlankOk}</p>
        </td>
        <td className="px-4 py-2 text-right">
          <button
            onClick={() =>
              startTransition(async () => {
                const r = await renameModel(id, n, l, tw, th);
                if (!r.ok) setErro(r.error);
                else {
                  setEditando(false);
                  setErro(null);
                  router.refresh();
                }
              })
            }
            disabled={pending}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            {t.models.save}
          </button>
          <button
            onClick={() => {
              setEditando(false);
              setN(nome);
              setL(linha ?? "");
              setTw(telaLargura ? String(telaLargura) : "");
              setTh(telaAltura ? String(telaAltura) : "");
              setErro(null);
            }}
            className="ml-2 text-xs text-muted hover:underline"
          >
            {t.models.cancel}
          </button>
          {erro && <span className="ml-2 text-xs text-danger">{erro}</span>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-surface">
      <td className="px-4 py-3 font-medium">
        {nome}
        {/* A contagem leva à lista. Antes era número morto: a tela dizia
            "Razr 60 Ultra · 2 aparelhos" e não havia como ver QUAIS são os dois —
            a pessoa ia à frota e filtrava na mão. Modelo sem aparelho não vira
            link, porque levaria a uma lista vazia. */}
        {aparelhos > 0 ? (
          <Link
            href={`/dispositivos?q=${encodeURIComponent(nome)}`}
            className="ml-2 text-xs text-muted hover:text-primary hover:underline"
          >
            {t.models.devices
              .replace("{n}", String(aparelhos))
              .replace("{aparelhos}", aparelhos === 1 ? "aparelho" : "aparelhos")}
          </Link>
        ) : (
          <span className="ml-2 text-xs text-muted">
            {t.models.devices
              .replace("{n}", String(aparelhos))
              .replace("{aparelhos}", "aparelhos")}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-muted">{linha ?? "—"}</td>
      {/* Modelo sem tela não é erro — só significa que os aparelhos dele recebem
          a peça principal, como sempre receberam. O aviso existe para quem está
          procurando por que o criativo por formato não pegou naquele modelo. */}
      <td className="whitespace-nowrap px-4 py-3 text-muted">
        {telaLargura && telaAltura ? (
          <span className="font-mono text-xs">
            {telaLargura}×{telaAltura}
          </span>
        ) : (
          <span className="text-xs">{t.models.noScreen}</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        {erro && <span className="mr-2 text-xs text-danger">{erro}</span>}
        {confirmando ? (
          <>
            <span className="mr-2 text-xs text-muted">{t.models.confirmDelete}</span>
            <button
              onClick={() =>
                startTransition(async () => {
                  const r = await deleteModel(id);
                  if (!r.ok) setErro(r.error);
                  setConfirmando(false);
                  router.refresh();
                })
              }
              disabled={pending}
              className="rounded-md border border-danger/40 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-40"
            >
              {t.models.confirm}
            </button>
          </>
        ) : (
          podeEditar && (
          <>
            <button
              onClick={() => setEditando(true)}
              className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-surface-2"
            >
              {t.models.rename}
            </button>
            <button
              onClick={() => {
                setErro(null);
                setConfirmando(true);
              }}
              className="ml-3 text-xs text-muted transition hover:text-danger hover:underline"
            >
              {t.models.delete}
            </button>
          </>
          )
        )}
      </td>
    </tr>
  );
}
