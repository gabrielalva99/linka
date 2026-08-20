"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * O menu do painel em tela de celular.
 *
 * O DEFEITO QUE ISTO CONSERTA. O menu lateral era `hidden sm:flex` — sumia
 * abaixo de 640px e não havia NADA no lugar. No celular, que é o aparelho de
 * quem está de pé dentro da loja, o painel ficava sem navegação nenhuma: dava
 * para entrar na ficha de um aparelho e não existia caminho de volta para a
 * visão geral, a não ser digitar a URL na mão. Cada tela só oferecia o "voltar"
 * da tela anterior.
 *
 * Fecha sozinho ao trocar de tela: menu que fica aberto por cima do conteúdo
 * depois de escolher para onde ir é o mesmo que não ter fechado.
 */
export function MenuMobile({
  itens,
}: {
  itens: { label: string; href: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname();

  useEffect(() => setAberto(false), [pathname]);

  // Esc fecha. Quem abriu sem querer precisa de uma saída que não seja
  // adivinhar onde clicar fora.
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-label="Menu"
        className="rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:bg-surface-2"
      >
        ☰
      </button>

      {aberto && (
        <>
          {/* A cortina serve para fechar tocando em qualquer lugar — no celular
              esse é o gesto esperado, e é mais fácil de acertar do que o botão. */}
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setAberto(false)}
            className="fixed inset-0 z-40 cursor-default bg-black/50"
          />
          <nav className="absolute left-0 right-0 top-full z-50 flex flex-col gap-1 border-b border-line bg-surface p-3 shadow-lg">
            {itens.map((item) => {
              const ativo =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    ativo
                      ? "rounded-md bg-surface-2 px-3 py-2.5 text-sm font-medium"
                      : "rounded-md px-3 py-2.5 text-sm text-muted hover:bg-surface-2"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </>
      )}
    </div>
  );
}
