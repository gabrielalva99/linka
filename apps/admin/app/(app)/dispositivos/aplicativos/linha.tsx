"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { classificarPacote } from "./actions";

/**
 * Uma decisão por pacote: é recurso que o cliente experimentou, ou é ruído do
 * sistema que abriu sozinho?
 *
 * O nome sugerido sai do próprio pacote (`com.motorola.batterycare` → "Battery
 * care"), porque digitar do zero em dezenas de linhas é o que faz ninguém
 * classificar. É sugestão: quem decide troca.
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  // Último trecho do pacote, com a primeira letra maiúscula. Erra às vezes, e
  // errar aqui é barato: o campo fica editável na frente da pessoa.
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-muted">{pacote}</p>
          <p className="mt-1 text-xs text-muted">
            {vezes} medição(ões) · {segundos}s no total · {aparelhos} aparelho(s) ·
            visto {ultimaVez}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <input
          value={rotulo}
          onChange={(e) => setRotulo(e.target.value)}
          disabled={pending}
          placeholder="Nome que a operação reconhece"
          className="min-w-52 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-40"
        />
        <button
          onClick={() => decidir(false)}
          disabled={pending}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
        >
          É um recurso
        </button>
        <button
          onClick={() => decidir(true)}
          disabled={pending}
          className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-surface-2 disabled:opacity-40"
        >
          É ruído
        </button>
        {erro && <span className="text-xs text-danger">{erro}</span>}
      </div>
    </li>
  );
}
