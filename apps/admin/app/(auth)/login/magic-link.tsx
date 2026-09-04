"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMessages } from "@/lib/i18n";

/**
 * Transforma o link de convite em sessão de verdade.
 *
 * Sem isto o convite não funcionava: o link do e-mail devolve os tokens no
 * PEDAÇO DA URL depois do "#", que o navegador nunca manda para o servidor.
 * A pessoa clicava, caía na tela de login e nada acontecia. Descoberto ao
 * tentar usar o próprio convite que eu tinha acabado de entregar.
 *
 * setSession grava a sessão nos cookies, que é o que o servidor lê nas telas.
 * E o endereço é limpo em seguida: token de acesso no histórico do navegador é
 * credencial deixada na mesa.
 */
export function MagicLink() {
  const t = getMessages();
  const [estado, setEstado] = useState<"nada" | "entrando" | "falhou">("nada");

  // Link do e-mail que já não vale (expirou, foi usado, ou não era link):
  // /auth/entrar manda para cá com esta marca. Lido da URL, e não copiado para
  // estado: a URL já é a fonte, e um F5 repete um aviso que continua verdadeiro.
  const expirado = useSearchParams().get("link") === "expirado";

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("access_token")) return;

    const p = new URLSearchParams(hash.slice(1));
    const access_token = p.get("access_token");
    const refresh_token = p.get("refresh_token");
    if (!access_token || !refresh_token) {
      setEstado("falhou");
      return;
    }

    setEstado("entrando");
    const supabase = createSupabaseBrowserClient();
    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) {
          setEstado("falhou");
          return;
        }
        // Recarga de página inteira, e não navegação do lado do cliente: o
        // cookie acabou de ser escrito e o pedido do React Server Component sai
        // antes de o navegador passar a mandá-lo. Com router.replace a pessoa
        // ficava parada em "Entrando…" para sempre, com a sessão já válida.
        window.location.replace("/");
      })
      .catch(() => setEstado("falhou"));
  }, []);

  const mostrar = estado === "nada" && expirado ? "falhou" : estado;
  if (mostrar === "nada") return null;

  return (
    <p
      className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
        mostrar === "falhou"
          ? "border-warning/40 bg-warning/10 text-warning"
          : "border-line bg-surface text-muted"
      }`}
    >
      {mostrar === "entrando" ? t.login.signingIn : t.login.linkExpired}
    </p>
  );
}
