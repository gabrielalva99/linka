"use client";

import { CampoSenha } from "@/components/campo-senha";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMessages } from "@/lib/i18n";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { LinkaLogo } from "../../linka-logo";

/**
 * Onde o link de recuperação termina: a pessoa escolhe a senha nova.
 *
 * O link do e-mail devolve os tokens no PEDAÇO DA URL DEPOIS DO "#", que o
 * navegador nunca envia ao servidor — a mesma pegadinha que já tinha quebrado o
 * convite (ver MagicLink). Então a sessão temporária é montada aqui, no
 * navegador, antes de qualquer coisa.
 *
 * E o endereço é limpo logo depois: token de acesso parado no histórico é
 * credencial deixada na mesa de quem usar o computador em seguida — e num
 * escritório de agência isso não é hipótese.
 */
export default function NovaSenhaPage() {
  const t = getMessages();
  const [pronto, setPronto] = useState(false);
  const [semSessao, setSemSessao] = useState(false);
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const hash = window.location.hash;

    async function preparar() {
      if (hash.includes("access_token")) {
        const p = new URLSearchParams(hash.slice(1));
        const access_token = p.get("access_token");
        const refresh_token = p.get("refresh_token");
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          history.replaceState(null, "", window.location.pathname);
          if (!error) {
            setPronto(true);
            return;
          }
        }
      }
      // Sem token na URL, ainda vale se a pessoa já estiver logada e só quiser
      // trocar a senha.
      const { data } = await supabase.auth.getSession();
      if (data.session) setPronto(true);
      else setSemSessao(true);
    }
    preparar();
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 8) {
      setErro(t.newPassword.tooShort);
      return;
    }
    if (senha !== repetir) {
      setErro(t.newPassword.mismatch);
      return;
    }
    setErro(null);
    setSalvando(true);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setSalvando(false);
      setErro(t.newPassword.failed);
      return;
    }
    // Recarga de página inteira: o cookie de sessão acabou de mudar e as telas
    // são renderizadas no servidor, que precisa vê-lo no próximo pedido.
    window.location.replace("/");
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <LinkaLogo className="h-8 w-auto" />
        </div>

        <h1 className="text-lg font-semibold">{t.newPassword.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.newPassword.subtitle}</p>

        {semSessao ? (
          <>
            <p className="mt-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
              {t.newPassword.noSession}
            </p>
            <Link
              href="/esqueci-senha"
              className="mt-6 inline-block text-sm text-muted hover:text-foreground hover:underline"
            >
              {t.login.forgot}
            </Link>
          </>
        ) : !pronto ? (
          <p className="mt-6 text-sm text-muted">{t.login.signingIn}</p>
        ) : (
          <form onSubmit={salvar} className="mt-6 flex flex-col gap-4">
            <CampoSenha
              rotulo={t.newPassword.password}
              autoComplete="new-password"
              value={senha}
              onChange={(ev) => setSenha(ev.target.value)}
            />
            <CampoSenha
              rotulo={t.newPassword.confirm}
              autoComplete="new-password"
              value={repetir}
              onChange={(ev) => setRepetir(ev.target.value)}
            />

            {erro && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={salvando}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {salvando ? t.newPassword.submitting : t.newPassword.submit}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
