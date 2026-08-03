"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getMessages } from "@/lib/i18n";

/**
 * Os botões de período (7 / 30 / 90 dias).
 *
 * POR QUE ISTO VIROU UM COMPONENTE DE CLIENTE, e não continuou sendo três links.
 *
 * O relatório tem `loading.tsx` desde o início, e ele funciona — mas SÓ quando
 * se chega na tela vindo de outra página. Trocar o período muda apenas o
 * parâmetro da URL dentro da MESMA rota, e nesse caso o Next não mostra o
 * esqueleto: ele mantém a tela antiga inteira, viva e clicável, até o servidor
 * responder. Do lado de quem clica, o botão simplesmente não reage.
 *
 * Foi exatamente o relato: "está muito lento a troca dessas abas e filtros,
 * cheguei a pensar que não estava funcionando". E o diagnóstico importa: o
 * banco responde o período de 90 dias em 118 ms. O problema nunca foi demora,
 * foi AUSÊNCIA DE RESPOSTA — sem sinal, meio segundo parece travamento, e a
 * pessoa clica de novo.
 *
 * `useTransition` resolve porque avisa na hora, antes de qualquer resposta: o
 * botão clicado já aparece marcado e o grupo inteiro esmaece. Quem clicou sabe
 * que pegou.
 *
 * DE QUEBRA, UM DEFEITO SEPARADO. O link antigo era `/relatorios?dias=30` e
 * nada mais — trocar o período APAGAVA o filtro de rede, loja e aparelho. Quem
 * estava olhando uma loja e queria a mesma loja em 30 dias voltava para a frota
 * inteira sem entender por quê. Aqui os outros parâmetros são preservados.
 */
export function PeriodoTabs({ periodos, atual }: { periodos: number[]; atual: number }) {
  const t = getMessages();
  const router = useRouter();
  const params = useSearchParams();
  const [pendente, iniciar] = useTransition();

  function ir(d: number) {
    if (d === atual) return;
    const p = new URLSearchParams(params.toString());
    p.set("dias", String(d));
    iniciar(() => router.push(`/relatorios?${p.toString()}`));
  }

  return (
    <div
      className={`flex items-center gap-2 transition-opacity ${
        pendente ? "pointer-events-none opacity-60" : ""
      }`}
      aria-busy={pendente}
    >
      {periodos.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => ir(d)}
          aria-current={d === atual ? "page" : undefined}
          className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
            d === atual
              ? "border-primary text-primary"
              : "border-line text-muted hover:bg-surface-2"
          }`}
        >
          {t.reports.days.replace("{n}", String(d))}
        </button>
      ))}
    </div>
  );
}
