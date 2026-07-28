"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActiveTenant } from "@/lib/tenant";
import { selecionarCliente } from "./tenant-actions";

/**
 * Em qual cliente quem opera a plataforma está trabalhando.
 *
 * Só aparece para quem enxerga mais de um. Para o usuário de uma marca não
 * existe escolha nenhuma a fazer — e um seletor com uma opção só é um enfeite
 * que faz a pessoa achar que existe outro lugar para ir.
 */
export function TenantSwitcher({
  clientes,
  atual,
}: {
  clientes: ActiveTenant[];
  atual: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={atual ?? ""}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          await selecionarCliente(e.target.value);
          router.refresh();
        })
      }
      className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs outline-none focus:border-primary disabled:opacity-40"
    >
      {clientes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
