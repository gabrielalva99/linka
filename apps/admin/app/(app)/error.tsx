"use client";

/**
 * Quando uma tela quebra de verdade.
 *
 * Sem isto o Next mostra a tela de erro dele, em inglês e com pilha de código —
 * numa demonstração isso é o fim da conversa. Aqui a pessoa lê uma frase em
 * português e tem um botão que resolve na maioria das vezes.
 */
export default function ErroDoPainel({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mt-10 rounded-xl border border-warning/40 bg-warning/10 p-6">
        <h1 className="text-lg font-semibold text-warning">Esta tela não carregou</h1>
        <p className="mt-2 text-sm text-muted">
          Pode ter sido a sessão expirando ou uma queda de rede. Tentar de novo
          costuma resolver; se insistir, saia e entre outra vez.
        </p>
        <button
          onClick={reset}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
