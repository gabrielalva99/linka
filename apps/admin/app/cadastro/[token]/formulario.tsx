"use client";

import { useActionState } from "react";
import { cadastrar, type CadastroState } from "./actions";
import { BOT_URL } from "@/lib/bot";

const inicial: CadastroState = { ok: false, erro: null, vinculo: null, jaVinculado: false };

const MOTIVO: Record<string, string> = {
  convite_invalido: "Este link não vale mais. Peça um novo para quem te enviou.",
  nome_curto: "Escreva seu nome completo.",
  telefone_invalido: "Confira o número: precisa ter DDD, como 11 98888-7777.",
  falhou: "Não consegui salvar agora. Tente de novo em um minuto.",
};

export function Formulario({ token }: { token: string }) {
  const [estado, acao, enviando] = useActionState(cadastrar, inicial);

  if (estado.ok) {
    return (
      <div className="mt-6 rounded-lg border border-primary/40 bg-primary/5 p-4">
        <p className="text-sm font-medium text-primary">Cadastro feito.</p>
        {/* FALTA UM PASSO, e é aqui que ele se perde.
            O cadastro diz quem é a pessoa; o bot é por onde a mensagem chega.
            Quem fecha esta página achando que terminou nunca recebe nada, e o
            painel mostra a loja como coberta. Por isso o botão é o elemento
            principal da tela, e o texto diz que falta uma coisa. */}
        {/* QUEM JÁ ESTÁ LIGADO NÃO GANHA CÓDIGO NOVO, e por isso não vê botão.
            O link de convite é encaminhável, e com ele mais o celular de alguém
            um estranho poderia recadastrar aquele número, pegar um código e
            assumir o lugar da pessoa no bot. O banco já recusa dar o código; a
            tela precisa contar a verdade em vez de pedir um passo que não
            existe mais. */}
        {estado.jaVinculado ? (
          <p className="mt-1 text-sm">
            Este número já está conectado ao nosso bot, e as lojas foram somadas
            às suas. Não precisa fazer mais nada.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm">
              Falta um passo: abra o nosso bot e toque em <strong>Iniciar</strong>.
              É por lá que os avisos chegam.
            </p>
            {/* O CÓDIGO VIAJA NO LINK. `?start=` entrega ele ao bot no primeiro
                contato, então o bot já sabe quem está falando e não precisa
                pedir o celular de novo. Menos uma pergunta é menos uma chance de
                a pessoa digitar diferente do que cadastrou. */}
            <a
              href={estado.vinculo ? `${BOT_URL}?start=${estado.vinculo}` : BOT_URL}
              className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-black"
            >
              Abrir o bot no Telegram
            </a>
          </>
        )}
      </div>
    );
  }

  return (
    <form action={acao} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">Seu nome</span>
        <input
          name="nome"
          required
          autoComplete="name"
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">Celular com DDD</span>
        {/* type=tel abre o teclado numérico no celular, que é onde isto vai ser
            preenchido. Sem máscara de propósito: o banco limpa o que vier, e
            máscara é o que mais faz gente desistir de formulário no balcão. */}
        <input
          name="celular"
          type="tel"
          inputMode="numeric"
          placeholder="11 98888-7777"
          required
          autoComplete="tel"
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>

      {estado.erro && (
        <p className="text-sm text-danger">
          {MOTIVO[estado.erro] ?? MOTIVO.falhou}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
      >
        {enviando ? "Salvando…" : "Quero receber os avisos"}
      </button>
    </form>
  );
}
