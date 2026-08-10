"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { classificarPacote } from "./actions";

/** Segundos em algo que se lê. Mesma conta da tela — "18432s" não é informação. */
function tempo(segundos: number): string {
  if (segundos < 60) return `${segundos}s`;
  if (segundos < 3600) return `${Math.round(segundos / 60)}min`;
  const h = Math.floor(segundos / 3600);
  const m = Math.round((segundos % 3600) / 60);
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/**
 * Uma decisão por aplicativo: o cliente abriu isso, ou abriu sozinho?
 *
 * O NOME LEGÍVEL VEM NA FRENTE. Antes o identificador principal era o pacote cru
 * (`com.motorola.batterycare`), e o nome sugerido ficava escondido dentro do
 * campo — a pessoa decidia olhando texto de programador. Agora o nome é o título
 * e o pacote é a referência pequena embaixo, para conferência.
 *
 * A sugestão sai do próprio pacote porque digitar do zero em dezenas de linhas é
 * o que faz ninguém classificar. É sugestão: quem decide troca.
 */
export function LinhaPacote({
  pacote,
  vezes,
  segundos,
  aparelhos,
  ultimaVez,
}: {
  pacote: string;
  vezes: number;
  segundos: number;
  aparelhos: number;
  ultimaVez: string;
}) {
  const t = getMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const sugestao = (() => {
    const ultimo = pacote.split(".").pop() ?? pacote;
    return ultimo.charAt(0).toUpperCase() + ultimo.slice(1);
  })();
  const [rotulo, setRotulo] = useState(sugestao);

  function decidir(ehRuido: boolean) {
    setErro(null);
    startTransition(async () => {
      const r = await classificarPacote(pacote, rotulo, ehRuido);
      if (!r.ok) setErro(r.error);
      else router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <p className="truncate text-sm font-medium">{rotulo || sugestao}</p>
      <p className="truncate font-mono text-xs text-muted">{pacote}</p>
      <p className="mt-1 text-xs text-muted">
        {t.apps.measured
          .replace("{n}", String(vezes))
          .replace("{t}", tempo(segundos))
          .replace("{d}", String(aparelhos))}
        {" · "}
        {t.apps.lastSeen.replace("{q}", ultimaVez)}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <label htmlFor={`nome-${pacote}`} className="sr-only">
          {t.apps.nameLabel}
        </label>
        <input
          id={`nome-${pacote}`}
          value={rotulo}
          onChange={(e) => setRotulo(e.target.value)}
          disabled={pending}
          placeholder={t.apps.nameLabel}
          className="min-w-52 flex-1 rounded-md border border-line bg-surface px-2 py-2 text-sm outline-none focus:border-primary disabled:opacity-40"
        />
        <button
          onClick={() => decidir(false)}
          disabled={pending}
          aria-busy={pending}
          aria-label={`${t.apps.markFeature}: ${rotulo || pacote}`}
          className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-40"
        >
          {t.apps.markFeature}
        </button>
        <button
          onClick={() => decidir(true)}
          disabled={pending}
          aria-busy={pending}
          aria-label={`${t.apps.markNoise}: ${rotulo || pacote}`}
          className="rounded-md border border-line px-3 py-2 text-xs text-muted hover:bg-surface-2 disabled:opacity-40"
        >
          {t.apps.markNoise}
        </button>
      </div>

      {/* A CONSEQUÊNCIA, junto dos botões. A tela dizia o que acontece se você
          NÃO decidir, e nunca o que acontece DEPOIS de decidir — que é o momento
          em que a pessoa está com o dedo no botão. */}
      <p className="mt-2 text-xs text-muted">{t.apps.consequence}</p>

      {erro && (
        <p className="mt-2 text-xs text-danger" role="alert">
          {erro}
        </p>
      )}
    </li>
  );
}
