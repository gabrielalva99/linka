"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirEmMassa } from "../bulk-actions";

/**
 * Tira (ou devolve) este aparelho do relatório, num clique.
 *
 * Antes só existia como caixinha dentro do formulário de editar aparelho — para
 * virar uma chave era preciso abrir o cadastro inteiro, com nome, código, IMEI e
 * loja, e salvar. Ninguém encontra, e quem encontra tem medo de salvar o resto.
 *
 * Fica ao lado do próprio número que ele afeta. É onde a decisão nasce: a pessoa
 * está olhando a medição do aparelho e conclui "isto aqui é a minha mesa, não é
 * loja" — ou o contrário, que era o caso do Gabriel: durante a implantação, tirar
 * os aparelhos do relatório deixa ele CEGO, porque não existe outra frota para
 * olhar. O botão precisa andar nos dois sentidos com o mesmo esforço.
 *
 * Reaproveita definirEmMassa com um id só, em vez de uma ação nova: a regra de
 * permissão e a linha de auditoria já vivem lá, e duas portas para a mesma
 * escrita é a receita de uma delas ficar sem a trava um dia.
 */
export function ReportToggle({
  deviceId,
  excluido,
}: {
  deviceId: string;
  excluido: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={() =>
          startTransition(async () => {
            const r = await definirEmMassa([deviceId], {
              excluirDoRelatorio: !excluido,
            });
            if (!r.ok) setErro(r.error);
            else {
              setErro(null);
              router.refresh();
            }
          })
        }
        disabled={pending}
        className="text-xs text-muted hover:text-fg hover:underline disabled:opacity-40"
      >
        {pending
          ? "Salvando…"
          : excluido
            ? "contar no relatório"
            : "tirar do relatório"}
      </button>
      {erro && <span className="text-xs text-danger">{erro}</span>}
    </span>
  );
}
