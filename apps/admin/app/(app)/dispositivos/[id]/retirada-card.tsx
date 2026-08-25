"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { identificarRetirada } from "./actions";

/**
 * Quem retirou este aparelho da vitrine.
 *
 * ── POR QUE ISTO MUDOU DE LUGAR (24/08) ─────────────────────────────────────
 * Até a 0.111.0 quem perguntava era o próprio aparelho: uma tela pedindo nome,
 * cargo e loja, atrás do PIN de manutenção. Funcionava, e tinha dois problemas.
 *
 * O primeiro é de conformidade: o aplicativo passava a coletar dado pessoal, e
 * a arquitetura promete o contrário desde o começo. Trocar o nome por um código
 * não resolveria, porque a taxonomia do Google trata "User IDs" como
 * informação pessoal igual a "Name".
 *
 * O segundo é que o registro era fraco. Ninguém conferia nada: a pessoa digitava
 * o que quisesse numa tela de celular. O código do agente dizia isso com todas
 * as letras, "o dado é DECLARATÓRIO".
 *
 * Aqui quem atribui já está autenticado e a trilha guarda quem afirmou. Saiu de
 * "alguém escreveu um nome" para "fulano, logado, disse que foi o beltrano".
 *
 * O aparelho continua contando o FATO e a HORA, que é o último recado que ele
 * consegue mandar antes de ser desinstalado.
 */
export function RetiradaCard({
  deviceId,
  retiradoEm,
  por,
  cargo,
  loja,
  quando,
  podeOperar,
}: {
  deviceId: string;
  retiradoEm: string;
  por: string | null;
  cargo: string | null;
  loja: string | null;
  /** Já formatado no fuso da loja pelo servidor. */
  quando: string;
  podeOperar: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [abrindo, setAbrindo] = useState(false);
  const [nome, setNome] = useState("");
  const [funcao, setFuncao] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const identificado = Boolean(por);

  return (
    <section
      className={`mt-8 rounded-xl border p-5 ${
        identificado ? "border-line bg-surface" : "border-warning/40 bg-warning/5"
      }`}
    >
      <h2 className="text-sm font-semibold">Retirado da vitrine para venda</h2>

      {identificado ? (
        <p className="mt-2 text-sm">
          {por}
          {cargo ? ` · ${cargo}` : ""}
          {loja ? ` · ${loja}` : ""}
        </p>
      ) : (
        <p className="mt-2 text-sm text-warning">Falta dizer quem retirou</p>
      )}

      <p className="mt-1 text-xs text-muted">
        {quando} · informado no próprio aparelho, com o PIN de manutenção da loja
      </p>

      {!identificado && podeOperar && !abrindo && (
        <button
          onClick={() => setAbrindo(true)}
          className="mt-3 rounded-md border border-warning/40 px-3 py-1.5 text-xs text-warning hover:bg-warning/10"
        >
          Dizer quem retirou
        </button>
      )}

      {!identificado && podeOperar && abrindo && (
        <div className="mt-3">
          <p className="text-xs text-muted">
            Fica registrado junto com o seu nome e a hora. Escreva de um jeito que
            se explique sozinho daqui a seis meses.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Quem retirou"
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
            <input
              value={funcao}
              onChange={(e) => setFuncao(e.target.value)}
              placeholder="Cargo (opcional)"
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={() =>
                startTransition(async () => {
                  const r = await identificarRetirada(deviceId, nome, funcao);
                  if (!r.ok) {
                    setErro(r.error);
                    return;
                  }
                  setAbrindo(false);
                  router.refresh();
                })
              }
              disabled={pending || nome.trim().length < 3}
              className="rounded-md border border-warning/40 px-3 py-1.5 text-xs text-warning hover:bg-warning/10 disabled:opacity-40"
            >
              {pending ? "Registrando…" : "Registrar"}
            </button>
            <button
              onClick={() => {
                setAbrindo(false);
                setErro(null);
              }}
              className="text-xs text-muted hover:underline"
            >
              Cancelar
            </button>
          </div>
          {erro && <p className="mt-2 text-xs text-danger">{erro}</p>}
        </div>
      )}

      {/* Não deixa apagar nem reescrever depois de dito. Registro que se edita
          sem rastro não serve para a conversa que ele existe para sustentar. */}
      {identificado && (
        <p className="mt-3 text-xs text-muted">
          Para corrigir esta informação, fale com quem administra a conta.
        </p>
      )}

      {retiradoEm && !identificado && !podeOperar && (
        <p className="mt-3 text-xs text-muted">
          Quem tem permissão de operação pode informar quem retirou.
        </p>
      )}
    </section>
  );
}
