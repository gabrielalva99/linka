"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { classificarPacote, removerClassificacao } from "./actions";

/**
 * Um aplicativo já decidido — e a chance de mudar de ideia.
 *
 * A lista de classificados era só leitura. Quem marcasse a câmera como ruído por
 * engano via o recurso mais testado da loja sumir do relatório, sem caminho de
 * volta pela tela. E esse erro não se denuncia: relatório sem câmera não parece
 * quebrado, parece que ninguém usou a câmera.
 *
 * As duas saídas fazem coisas diferentes de propósito. TROCAR resolve o caso
 * comum (errou o lado) sem tirar o aplicativo do catálogo. REMOVER devolve o
 * aplicativo à fila de pendentes, que é a resposta honesta quando a dúvida é "o
 * que é isso, afinal?" — alguém decide de novo, com calma.
 */
export function LinhaClassificada({
  pacote,
  rotulo,
  ehRuido,
}: {
  pacote: string;
  rotulo: string;
  ehRuido: boolean;
}) {
  const t = getMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  function agir(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.error ?? t.apps.errGeneric);
      else {
        setConfirmando(false);
        router.refresh();
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-surface-2 px-3 py-2 text-xs">
      <span className="min-w-0 flex-1">
        <span className="block truncate">{rotulo}</span>
        <span className="block truncate font-mono text-muted">{pacote}</span>
      </span>

      <span className="flex shrink-0 flex-wrap items-center gap-2">
        <span className={ehRuido ? "text-muted" : "text-success"}>
          {ehRuido ? t.apps.isNoise : t.apps.isFeature}
        </span>

        {/* Trocar de lado: o caso comum é ter errado o botão, não ter errado o
            aplicativo. Um clique resolve sem tirar nada do catálogo. */}
        <button
          type="button"
          onClick={() => agir(() => classificarPacote(pacote, rotulo, !ehRuido))}
          disabled={pending}
          aria-label={`${ehRuido ? t.apps.markFeature : t.apps.markNoise}: ${rotulo}`}
          className="rounded-md border border-line px-2 py-1.5 text-xs text-muted hover:bg-surface disabled:opacity-40"
        >
          {ehRuido ? t.apps.markFeature : t.apps.markNoise}
        </button>

        {confirmando ? (
          <>
            <span className="text-muted">{t.apps.removeConfirm}</span>
            <button
              type="button"
              onClick={() => agir(() => removerClassificacao(pacote))}
              disabled={pending}
              aria-busy={pending}
              className="rounded-md border border-danger/40 px-2 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-40"
            >
              {t.apps.confirm}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="px-1 py-1.5 text-xs text-muted hover:underline"
            >
              {t.apps.cancel}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            disabled={pending}
            aria-label={`${t.apps.remove}: ${rotulo}`}
            className="px-1 py-1.5 text-xs text-muted hover:text-danger hover:underline disabled:opacity-40"
          >
            {t.apps.remove}
          </button>
        )}
      </span>

      {erro && (
        <span className="w-full text-danger" role="alert">
          {erro}
        </span>
      )}
    </li>
  );
}
