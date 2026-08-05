"use client";

import { useEffect, useState } from "react";

/**
 * Índice lateral + revelação das seções no scroll.
 *
 * Fica num componente de cliente sozinho para a página continuar sendo
 * renderizada no servidor: é o único pedaço que precisa de JS no navegador.
 *
 * Duas regras que valem a pena manter:
 *  1. O índice só aparece quando cabe na sarjeta sem entrar na coluna de
 *     conteúdo (1240px de coluna + rótulo + folga).
 *  2. A revelação NUNCA é o que decide se o conteúdo existe: se o observer
 *     não disparar, um temporizador limpa tudo. Página invisível é pior do
 *     que página sem animação.
 */

/**
 * Os `id` são URL pública: alguém vai colar linkaretail.com.br/#o-dado-que-falta
 * numa conversa. Então eles seguem três regras:
 *
 *  1. Dizem o que a pessoa vai encontrar. Havia um `#tese` aqui — vocabulário
 *     nosso, que não significa nada para um diretor de marca.
 *  2. Sem acento. Acento vira `%C3%A7` quando o link é copiado, e o endereço
 *     chega no WhatsApp parecendo defeito.
 *  3. Não mudam mais. Âncora que circulou e some vira link quebrado; estas
 *     foram acertadas em 05/08, horas depois de o site subir, justamente por
 *     ser a última janela barata.
 */
const SECOES = [
  { id: "perguntas-sem-resposta", rotulo: "Perguntas" },
  { id: "dispositivos", rotulo: "Dispositivos" },
  { id: "plataforma", rotulo: "Plataforma" },
  { id: "o-dado-que-falta", rotulo: "O dado que falta" },
  { id: "o-que-se-mede", rotulo: "O que se mede" },
  { id: "aplicacoes", rotulo: "Aplicações" },
  { id: "como-comecar", rotulo: "Como começar" },
];

export function IndiceLateral() {
  const [visivel, setVisivel] = useState(false);
  const [ativa, setAtiva] = useState<string | null>(null);

  useEffect(() => {
    const ajusta = () => setVisivel(window.innerWidth >= 1580);
    ajusta();
    window.addEventListener("resize", ajusta);
    return () => window.removeEventListener("resize", ajusta);
  }, []);

  useEffect(() => {
    const alvos = SECOES.map((s) => document.getElementById(s.id)).filter(
      (n): n is HTMLElement => Boolean(n)
    );
    if (!alvos.length) return;
    const ob = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((e) => {
          if (e.isIntersecting) setAtiva(e.target.id);
        });
      },
      { rootMargin: "-45% 0px -45% 0px" }
    );
    alvos.forEach((n) => ob.observe(n));
    return () => ob.disconnect();
  }, []);

  if (!visivel) return null;

  return (
    <nav
      aria-label="Seções da página"
      className="fixed top-1/2 z-15 flex -translate-y-1/2 flex-col gap-3.5"
      style={{ left: "calc(50% - 620px - 163px)" }}
    >
      {SECOES.map((s) => {
        const on = ativa === s.id;
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
              on ? "text-foreground" : "text-ink-600"
            }`}
          >
            <span
              className={`size-1.5 shrink-0 rounded-full transition-all ${
                on ? "scale-140 bg-primary" : "bg-line"
              }`}
            />
            {s.rotulo}
          </a>
        );
      })}
    </nav>
  );
}

export function RevelaSecoes() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const secoes = Array.from(
      document.querySelectorAll<HTMLElement>("main > section")
    ).slice(1);
    if (!secoes.length) return;

    const revelar = (s: HTMLElement) => {
      s.style.opacity = "1";
      s.style.transform = "none";
    };
    secoes.forEach((s) => {
      s.style.opacity = "0";
      s.style.transform = "translateY(12px)";
      s.style.transition = "opacity .45s ease-out, transform .45s ease-out";
    });

    const ob = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((e) => {
          if (e.isIntersecting) {
            revelar(e.target as HTMLElement);
            ob.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
    );
    secoes.forEach((s) => ob.observe(s));

    // Rede de segurança.
    const desiste = () => {
      ob.disconnect();
      secoes.forEach(revelar);
    };
    const t1 = setTimeout(() => {
      const preso = secoes.some(
        (s) => s.style.opacity === "0" && s.getBoundingClientRect().top < window.innerHeight
      );
      if (preso) desiste();
    }, 1200);
    const t2 = setTimeout(desiste, 4000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      desiste();
    };
  }, []);

  return null;
}
