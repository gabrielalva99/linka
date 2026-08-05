/**
 * Endereço público do site, em UM lugar.
 *
 * Ele aparece no canonical, no sitemap, no robots e no dado estruturado. Escrito
 * quatro vezes, basta a quinta divergir para o buscador ver dois sites onde só
 * existe um — e canonical apontando para o endereço errado é o tipo de defeito
 * que ninguém percebe olhando a tela.
 */
export const SITE = "https://linkaretail.com.br";

/**
 * O que a LINKA é, dito uma vez.
 *
 * O título da aba é só "LINKA", por escolha. Quem carrega a explicação para o
 * buscador e para quem recebe o link compartilhado é este texto.
 */
export const RESUMO =
  "Plataforma que controla, atualiza e mede os aparelhos de demonstração de uma marca no varejo físico. Campanha certa em cada loja, medição de quem pegou o aparelho e do que quis testar, sem câmera e sem reconhecimento facial.";

/**
 * Para onde vai quem quer conversar sobre contratar.
 *
 * É outro endereço do que o da política de privacidade, e de propósito: lá o
 * contato é o encarregado de dados (suporte@), um canal com prazo legal para
 * responder. Misturar os dois enterraria um pedido de LGPD no meio de proposta
 * comercial.
 */
export const CONTATO = "comercial@linkaretail.com.br";

/** Pré-preenche o assunto para a mensagem não chegar sem nada na linha. */
export const CONTATO_MAILTO = `mailto:${CONTATO}?subject=${encodeURIComponent("Quero conhecer a LINKA")}`;
