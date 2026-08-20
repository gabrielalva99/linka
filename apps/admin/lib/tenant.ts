import { cache } from "react";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActiveTenant = {
  id: string;
  name: string;
  slug: string;
  /** Sem contato por mais que isto, o aparelho é dado como fora do ar. */
  toleranciaSemContatoMs: number;
};

/**
 * Quanto tempo de silêncio significa "fora do ar".
 *
 * NÃO É UM NÚMERO ESCOLHIDO AQUI. Vem do banco, calculado a partir do ritmo com
 * que o aparelho avisa que está vivo — três avisos perdidos. Isso importa porque
 * o ritmo é ajustável: espaçá-lo com um "3 minutos" escrito na tela pintaria a
 * frota inteira de vermelho.
 *
 * Existia em três lugares, com dois valores diferentes: 3 minutos na lista de
 * aparelhos, 3 minutos de novo escritos à mão na tela da loja, e 5 minutos na
 * lista de pendências. Duas telas do mesmo painel discordando sobre quem está no
 * ar é pior do que as duas erradas — nenhuma das duas merece confiança.
 */
const TOLERANCIA_PADRAO_MS = 3 * 60 * 1000;

export function toleranciaSemContatoMs(tenant: ActiveTenant | null): number {
  return tenant?.toleranciaSemContatoMs ?? TOLERANCIA_PADRAO_MS;
}

/** Cookie que guarda o cliente escolhido por quem opera a plataforma. */
export const TENANT_COOKIE = "linka_tenant";

/**
 * Clientes que a pessoa logada enxerga. O RLS já faz o recorte: quem é da
 * Motorola vê a Motorola; quem opera a plataforma vê todos.
 */
/**
 * Clientes que a operação enxerga — só os ATIVOS.
 *
 * O filtro é o que dá sentido a desativar um cliente. Antes a coluna is_active
 * existia e ninguém a lia: desativar não fazia efeito em lugar nenhum, e o
 * cliente continuava no seletor esperando alguém cadastrar uma loja dentro de um
 * contrato encerrado.
 *
 * A tela de Clientes NÃO usa esta função de propósito: é lá que se reativa, e um
 * cliente que desaparece da própria tela de administração não tem volta.
 */
/*
 * `cache` aqui vale por muitas viagens. `tenantFilter` chama esta funcao E
 * `getActiveTenant`, que chama esta funcao DE NOVO — duas idas ao banco para
 * uma pergunta so. Multiplique pelas telas que pedem o filtro mais de uma vez e
 * pelo layout, que pede junto: a visao geral fazia mais de dez consultas em
 * sequencia, uma esperando a outra, antes de comecar as dez que interessam.
 * Foi o que sobrou de lentidao depois de mover a execucao para Sao Paulo.
 */
export const listTenants = cache(async function listTenants(): Promise<ActiveTenant[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("tenants")
    .select("id, name, slug, tolerancia_sem_contato_segundos")
    .eq("is_active", true)
    .order("name");
  return (data ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    slug: t.slug as string,
    toleranciaSemContatoMs:
      Number(t.tolerancia_sem_contato_segundos ?? 180) * 1000,
  }));
});

/**
 * Cliente sobre o qual as telas operam.
 *
 * Antes isto devolvia "o primeiro cliente cadastrado". Funcionava porque só
 * existe um — e no dia em que entrasse o segundo, toda loja, todo aparelho e
 * todo convite criados iriam parar na Motorola, sem erro e sem aviso. Registro
 * gravado no cliente errado não dá tela vermelha: dá relatório errado meses
 * depois, quando já não dá para saber o que era de quem.
 *
 * Agora sai de quem está logado:
 *  - um cliente só à vista (qualquer usuário de marca): é ele, sem escolha;
 *  - vários (quem opera a plataforma): vale o escolhido no seletor.
 *
 * Sem escolha feita, cai no primeiro da lista — mas com o seletor no topo
 * dizendo qual é. A diferença para o defeito antigo não é o critério de
 * desempate, é a escolha estar VISÍVEL e ser trocável: antes o painel decidia
 * sozinho e ninguém tinha como saber nem mudar.
 */
/*
 * SEM `cache` DE PROPOSITO, ao contrario de listTenants. Esta funcao le o
 * COOKIE, e o cookie muda no meio da requisicao: o seletor de cliente grava o
 * novo valor e manda o layout inteiro recarregar. Um valor memorizado antes
 * dessa troca faria a tela seguinte responder com o cliente anterior — e
 * cliente errado nao da tela vermelha, da campanha de uma marca na vitrine de
 * outra. O que ela tem de caro (a lista) ja vem do cache de listTenants, entao
 * memorizar aqui economizaria quase nada e arriscaria isso.
 */
export async function getActiveTenant(): Promise<ActiveTenant | null> {
  const disponiveis = await listTenants();
  if (disponiveis.length === 0) return null;
  if (disponiveis.length === 1) return disponiveis[0];

  const escolhido = (await cookies()).get(TENANT_COOKIE)?.value;
  // Confere contra a lista em vez de confiar no cookie: cookie é entrada do
  // usuário. Sem isso bastaria editar o valor para operar no cliente de outra
  // marca — e o RLS não recusaria, porque quem opera a plataforma tem acesso a
  // todos por definição.
  return disponiveis.find((t) => t.id === escolhido) ?? disponiveis[0];
}

/**
 * Id para filtrar as LISTAS por cliente, ou null quando não há o que filtrar.
 *
 * Devolve null com um cliente só porque aí o RLS já fez o recorte e o filtro
 * seria peso morto em toda consulta. Com mais de um, filtrar é obrigatório: para
 * quem opera a plataforma o RLS deixa passar TODOS os clientes, e sem o filtro a
 * lista de lojas da Motorola viria misturada com a da marca seguinte.
 */
/* Sem `cache` pelo mesmo motivo de getActiveTenant: depende do cookie. */
export async function tenantFilter(): Promise<string | null> {
  const disponiveis = await listTenants();
  if (disponiveis.length <= 1) return null;
  return (await getActiveTenant())?.id ?? null;
}

/**
 * Aplica o recorte de cliente a uma consulta, quando há recorte a aplicar.
 *
 * Existe para a chamada ficar de uma linha só em toda tela. Espalhar
 * `if (filtro) q = q.eq(...)` por vinte arquivos é como um deles fica de fora —
 * e o que fica de fora não dá erro, dá lista de duas marcas juntas.
 */
export function porCliente<Q>(consulta: Q, tenantId: string | null): Q {
  if (!tenantId) return consulta;
  // A conversão é de propósito. Exigir a forma do construtor de consulta no
  // próprio tipo faz o TypeScript desistir ("type instantiation is excessively
  // deep") nas telas que montam quatro consultas de uma vez.
  return (consulta as { eq(coluna: string, valor: string): Q }).eq(
    "tenant_id",
    tenantId,
  );
}

/**
 * Aparelhos EM OPERAÇÃO: do cliente certo e não arquivados. Use em toda tela
 * que conta, lista ou oferece aparelho para escolher.
 *
 * Existe por causa de um defeito que voltou quatro vezes. O painel dizia "os 6
 * aparelhos estão reportando" com dois na mesa; a lista da frota mostrava 2; a
 * tela de versões dizia "2 de 6". Cada tela tinha seu próprio filtro, então
 * corrigir uma não corrigia as outras — e quem apontava a diferença era sempre o
 * Gabriel, tela por tela. Número errado não dá erro em lugar nenhum: só faz duas
 * telas do mesmo painel discordarem, e aí nenhuma das duas merece confiança.
 *
 * A tela de versões era o caso pior: além de somar arquivado, não filtrava
 * cliente NENHUM. Para quem opera a plataforma, o RLS libera todos os clientes,
 * então ela contava os aparelhos de outras marcas no denominador da Motorola.
 *
 * As duas condições andam juntas de propósito: separadas, esquecer uma é fácil,
 * e é exatamente o que aconteceu. Uma chamada, um jeito certo.
 *
 * Onde NÃO usar: (1) histórico — visita que aconteceu aconteceu, e relatório de
 * março tem que continuar batendo depois que o aparelho sai de linha; (2) travas
 * de exclusão — impedir apagar um modelo tem que contar o arquivado também, ou o
 * banco recusa por chave estrangeira e a tela devolve "falhou" sem motivo.
 */
export function emOperacao<Q>(consulta: Q, tenantId: string | null): Q {
  return (
    porCliente(consulta, tenantId) as {
      eq(coluna: string, valor: boolean): Q;
    }
  ).eq("is_active", true);
}
