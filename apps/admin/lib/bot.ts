/**
 * O bot que fala com a loja.
 *
 * Fica num lugar só porque aparece em dois: no convite que a operação manda e
 * no fim do cadastro, quando a pessoa precisa iniciar a conversa. Trocar o bot
 * de nome com o valor espalhado deixaria metade dos links apontando para o
 * lugar antigo, e link quebrado num convite é alguém que não se cadastra.
 */
export const BOT_TELEGRAM = "LinkaAlertaBot";
export const BOT_URL = `https://t.me/${BOT_TELEGRAM}`;

/**
 * A mensagem que a operação manda para quem cuida da loja.
 *
 * Vem pronta de propósito. Quem manda está com pressa e no meio de outra coisa;
 * se precisar escrever o texto, escreve pouco, e a pessoa do outro lado não
 * entende o que é aquilo nem por que deveria clicar.
 *
 * Dois passos numerados porque são dois mesmo: o cadastro diz QUEM é a pessoa e
 * de quais lojas ela cuida, e o bot é por onde a mensagem chega. Sem o segundo,
 * o cadastro existe e ninguém consegue ser avisado.
 */
export function convitePorMensagem(linkDeCadastro: string, loja: string): string {
  return [
    `Oi! Você vai receber um aviso sempre que algum aparelho de demonstração da ${loja} parar de funcionar.`,
    "",
    "São dois passos rápidos:",
    "",
    "1) Cadastre seu nome e celular aqui:",
    linkDeCadastro,
    "",
    "2) Abra o nosso bot e toque em Iniciar:",
    BOT_URL,
    "",
    "Depois disso é só responder as mensagens quando chegarem. Para sair, responda SAIR a qualquer momento.",
  ].join("\n");
}
