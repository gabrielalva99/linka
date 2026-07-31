import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Transforma nome de aparelho e de loja no relatório em caminho para agir.
 *
 * O relatório tinha UM link em toda a tela. Ele apontava cinco tipos de problema
 * — app proibido aberto, aparelho sem visita, aparelho com pouca visita, loja
 * fraca — e nomeava o culpado em texto morto. Quem lê "Ajustes · 114 · razr 663E"
 * já sabe o que quer fazer: abrir o 114 e ligar o bloqueio. Tinha que decorar o
 * código, ir à frota e procurar.
 *
 * POR QUE AQUI E NÃO NO BANCO. As views de BI são de propósito dimensionais: elas
 * falam em `codigo`, `aparelho` e `loja`, sem id, porque o cliente nº 1 delas é o
 * BI em planilha da ProSolution. Enfiar id nelas mudaria um contrato de dados por
 * causa de um link de tela. O painel tem no máximo 250 aparelhos e 15 lojas —
 * resolver o id aqui custa uma consulta.
 *
 * APARELHO liga pelo CÓDIGO, que é único por cliente no banco (devices
 * tenant_id+code). Aparelho sem código não vira link, porque não há como saber
 * qual é.
 *
 * LOJA liga pelo NOME, e NOME DE LOJA NÃO É ÚNICO. Duas lojas homônimas de redes
 * diferentes existem de verdade ("Shopping Central" da rede A e da rede B), e
 * mandar a pessoa para o endereço errado é pior do que não mandar para lugar
 * nenhum: ela vai conferir a vitrine de outra loja e concluir que o relatório
 * mente. Nome repetido fica sem link, de propósito.
 */
export type Atalhos = {
  aparelho: (codigo: string | null | undefined, nome: string) => ReactNode;
  loja: (nome: string) => ReactNode;
};

const CLASSE = "hover:text-primary hover:underline";

export function criarAtalhos(
  aparelhos: { id: string; code: string | null }[],
  lojas: { id: string; name: string }[],
): Atalhos {
  const porCodigo = new Map<string, string>();
  for (const a of aparelhos) {
    if (a.code) porCodigo.set(a.code, a.id);
  }

  // Conta antes de mapear: só entra no mapa o nome que aparece uma vez.
  const vezes = new Map<string, number>();
  for (const l of lojas) vezes.set(l.name, (vezes.get(l.name) ?? 0) + 1);
  const porNomeDeLoja = new Map<string, string>();
  for (const l of lojas) {
    if (vezes.get(l.name) === 1) porNomeDeLoja.set(l.name, l.id);
  }

  return {
    aparelho(codigo, nome) {
      const id = codigo ? porCodigo.get(codigo) : undefined;
      const rotulo = codigo ? `${codigo} · ${nome}` : nome;
      if (!id) return rotulo;
      return (
        <Link href={`/dispositivos/${id}`} className={CLASSE}>
          {rotulo}
        </Link>
      );
    },
    loja(nome) {
      const id = porNomeDeLoja.get(nome);
      if (!id) return nome;
      return (
        <Link href={`/lojas/${id}`} className={CLASSE}>
          {nome}
        </Link>
      );
    },
  };
}
