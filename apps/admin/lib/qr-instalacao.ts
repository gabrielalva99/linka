import QRCode from "qrcode";

/**
 * O QR que instala um aparelho novo na loja, sem notebook e sem digitação.
 *
 * COMO O PROMOTOR USA. Aparelho lacrado, liga, toca seis vezes na tela de
 * boas-vindas, aponta a câmera. O Android baixa o app sozinho, entrega a ele o
 * controle do aparelho e a vitrine sobe já vinculada à loja certa.
 *
 * POR QUE ISTO EXISTE. Tornar o LINKA dono do aparelho é o que permite travar em
 * quiosque, esconder a loja de aplicativos e impedir senha de tela. O Android só
 * concede isso por cabo, por este QR, por aproximação ou por compra credenciada —
 * e o QR é o único que não precisa de computador. Sem ele, cada lançamento de
 * produto exigiria um técnico visitando lojas para configurar duas ou três peças.
 */

/** Impressão digital da chave que assina nosso APK. */
const ASSINATURA = "eSWvLWJnzUTGp_ryzpbFnrwgLq35EFJarxSm4qq5Mt4";
const COMPONENTE = "com.linka.agent/com.linka.agent.LinkaDeviceAdminReceiver";

export type DadosDoQr = {
  /** Código do cliente + código da loja: "LKYYKHQ6-SPC7613". */
  codigo: string;
  /** Endereço do APK publicado. */
  apkUrl: string;
  /** Fuso da loja, do cadastro dela. Sem ele, vale o de São Paulo. */
  fuso?: string | null;
};

/**
 * IDIOMA E FUSO, definidos na instalação e não depois.
 *
 * O aparelho de vitrine sai da caixa no idioma que a fábrica quiser, e o LINKA
 * trava a troca de idioma (`DISALLOW_CONFIG_LOCALE`) para o cliente da loja não
 * deixar o aparelho em outra língua. As duas coisas juntas querem dizer que um
 * aparelho instalado em inglês FICA em inglês. O QR é o momento de escolher, e é
 * o único em que o Android aceita isso sem ninguém tocar em Ajustes.
 *
 * O fuso pesa mais do que parece: a sessão vai para o servidor com a hora do
 * aparelho, e o relatório lê por hora local da loja.
 */
const IDIOMA = "pt_BR";
const FUSO_PADRAO = "America/Sao_Paulo";

export function conteudoDoQr({ codigo, apkUrl, fuso }: DadosDoQr): string {
  return JSON.stringify({
    "android.app.extra.PROVISIONING_LOCALE": IDIOMA,
    "android.app.extra.PROVISIONING_TIME_ZONE": fuso || FUSO_PADRAO,
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": COMPONENTE,
    // Sem esta impressão digital, qualquer arquivo trocado no caminho seria
    // instalado como dono do aparelho. Com ela, o Android recusa o que não foi
    // assinado pela nossa chave.
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": ASSINATURA,
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": apkUrl,
    // MANTER OS APPS DO SISTEMA. Sem isto o Android desliga tudo que não é
    // essencial durante a instalação — e o aparelho é uma VITRINE: o cliente da
    // loja precisa abrir câmera, galeria e o resto para experimentar. Um aparelho
    // de demonstração sem os apps do fabricante não demonstra nada.
    "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true,
    // O código da loja viaja aqui dentro. É o que faz o aparelho nascer no lugar
    // certo sem ninguém digitar — e digitação em campo é de onde vem aparelho
    // ligado na loja de outra cidade, erro que só aparece quando o relatório não
    // fecha, dias depois.
    "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": { codigo },
  });
}

/** Devolve o QR como SVG, para caber tanto na tela quanto no papel. */
export async function svgDoQr(dados: DadosDoQr): Promise<string> {
  return QRCode.toString(conteudoDoQr(dados), {
    type: "svg",
    // Correção alta: este QR vai ser lido de papel amassado, sob luz de loja, por
    // uma câmera que não é a melhor do mundo. Sobra de correção custa tamanho e
    // economiza uma viagem.
    errorCorrectionLevel: "H",
    margin: 1,
    width: 420,
  });
}
