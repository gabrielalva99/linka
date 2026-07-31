"use client";

import { useState } from "react";

/**
 * Campo de senha com o olhinho de mostrar/esconder.
 *
 * POR QUE EXISTE, e por que num componente só. Sem ele, quem digita uma senha
 * pela primeira vez — que é justamente o momento em que ela ainda não está na
 * memória dos dedos — não tem como conferir o que escreveu. O caso que motivou:
 * definir a senha de um acesso novo e errar em silêncio, com a tela dizendo
 * apenas "senha incorreta" na tentativa seguinte.
 *
 * São três campos no produto (entrar, senha nova, repetir a nova). Copiar o botão
 * nos três seria garantir que um dia eles fiquem diferentes.
 *
 * O padrão de segurança está mantido: nasce escondido, e volta a esconder ao
 * enviar o formulário. Vitrine e painel às vezes ficam abertos numa loja.
 */
export function CampoSenha({
  rotulo,
  ...props
}: { rotulo: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [visivel, setVisivel] = useState(false);

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-muted">{rotulo}</span>
      <div className="relative">
        <input
          {...props}
          type={visivel ? "text" : "password"}
          // Espaço à direita para o botão não cobrir o que está sendo digitado.
          className="w-full rounded-md border border-line bg-surface px-3 py-2 pr-11 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          // tabIndex -1: o Tab vai do campo direto para o botão de entrar. Quem
          // usa teclado não quer parar num controle opcional no meio do caminho.
          tabIndex={-1}
          aria-label={visivel ? "Esconder senha" : "Mostrar senha"}
          aria-pressed={visivel}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted transition hover:text-foreground"
        >
          {visivel ? (
            // Olho cortado = está visível, clique para esconder.
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.6 10.6a2 2 0 002.8 2.8" />
              <path d="M16.7 16.7A9.8 9.8 0 0112 18c-5 0-9-6-9-6a17 17 0 014.1-4.7m3.2-1.1A9.8 9.8 0 0112 6c5 0 9 6 9 6a17 17 0 01-2.4 3.2" />
              <path d="M3 3l18 18" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z" />
              <circle cx="12" cy="12" r="2.6" />
            </svg>
          )}
        </button>
      </div>
    </label>
  );
}
