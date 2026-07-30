"use client";

import { useState } from "react";
import Link from "next/link";
import { getMessages } from "@/lib/i18n";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { LinkaLogo } from "../../linka-logo";

/**
 * Recuperar acesso.
 *
 * O buraco que isto fecha: o painel só tinha login por e-mail e senha, mas
 * ninguém aqui DEFINIU uma senha — as contas nascem por convite/link. Bastava a
 * sessão expirar para a pessoa ficar na porta, olhando um campo de senha que ela
 * nunca criou, sem caminho de volta. Descoberto na varredura de 29/07.
 *
 * A resposta é SEMPRE a mesma, exista a conta ou não. Dizer "e-mail não
 * cadastrado" é entregar a lista de quem usa o sistema a qualquer curioso — o
 * mesmo cuidado que a tela de login já tem ao não distinguir e-mail errado de
 * senha errada.
 *
 * Roda no navegador porque quem manda o e-mail é o Supabase Auth e o link precisa
 * voltar para uma tela nossa. Nada aqui toca dado de cliente.
 */
export default function EsqueciSenhaPage() {
  const t = getMessages();
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"nada" | "enviando" | "enviado" | "erro">("nada");
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setErro(t.recover.required);
      return;
    }
    setErro(null);
    setEstado("enviando");

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      // O link volta para a tela que troca a senha, e não para a de login: o
      // Supabase devolve os tokens no pedaço da URL depois do "#", e é lá que a
      // sessão temporária é montada.
      redirectTo: `${window.location.origin}/nova-senha`,
    });

    // Falha de envio não vira "e-mail não existe" na tela. Só erro de verdade
    // (rede, limite de envio) aparece como erro.
    if (error && !/user|not found|invalid/i.test(error.message)) {
      setEstado("erro");
      setErro(t.recover.failed);
      return;
    }
    setEstado("enviado");
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <LinkaLogo className="h-8 w-auto" />
        </div>

        <h1 className="text-lg font-semibold">{t.recover.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.recover.subtitle}</p>

        {estado === "enviado" ? (
          <p className="mt-6 rounded-lg border border-success/40 bg-success/5 px-4 py-3 text-sm text-success">
            {t.recover.sent}
          </p>
        ) : (
          <form onSubmit={enviar} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-muted">{t.recover.email}</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>

            {erro && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={estado === "enviando"}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {estado === "enviando" ? t.recover.submitting : t.recover.submit}
            </button>
          </form>
        )}

        <Link
          href="/login"
          className="mt-6 inline-block text-sm text-muted hover:text-fg hover:underline"
        >
          {t.login.backToLogin}
        </Link>
      </div>
    </main>
  );
}
