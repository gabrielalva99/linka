/**
 * Política de privacidade — página PÚBLICA, sem login.
 *
 * Fica fora do grupo (app), que é onde mora o `redirect("/login")`. Precisa ser
 * alcançável por quem não tem conta: o Google exige a URL para publicar o app, e
 * o procurement da marca vai abrir sem pedir acesso a ninguém.
 *
 * ── Por que ela é específica, e não um modelo genérico ──────────────────────
 * A maioria das políticas descreve um sistema que não é o sistema. Esta descreve
 * o nosso: cada frase aqui corresponde a uma coluna, um evento ou uma rotina que
 * existe no banco. Isso deixou de ser esmero e virou argumento comercial no dia
 * em que a alternativa do mercado passou a ser câmera lendo rosto de cliente —
 * dado biométrico, sensível na LGPD, e com condenação judicial no Brasil por
 * fazer isso sem consentimento (caso ViaQuatro, TJ-SP).
 *
 * Dizer "não capturamos imagem" só vale se for verdade e se der para provar. É.
 */

export const metadata = {
  title: "Política de privacidade · LINKA",
  description:
    "O que a plataforma LINKA mede nos aparelhos de demonstração, o que ela não mede, e como tratamos dados pessoais.",
};

const ATUALIZADA_EM = "4 de agosto de 2026";

export default function PoliticaDePrivacidade() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-foreground">
      <h1 className="text-3xl font-semibold">Política de privacidade</h1>
      <p className="mt-2 text-sm text-muted">Atualizada em {ATUALIZADA_EM}</p>

      <Secao titulo="Em uma frase">
        <p>
          A LINKA mede como as pessoas <strong>usam o aparelho de demonstração</strong> na
          loja: quais recursos foram abertos e por quanto tempo. Não capturamos imagem, não
          gravamos áudio, não usamos câmera, não coletamos localização e não identificamos
          quem passa pela loja.
        </p>
      </Secao>

      <Secao titulo="Quem é responsável pelo quê">
        <p>
          A plataforma é usada por marcas e varejistas para operar seus próprios aparelhos de
          demonstração. Em relação aos dados medidos nas lojas, <strong>o cliente contratante
          é o controlador</strong> e a LINKA atua como <strong>operadora</strong>, tratando os
          dados conforme as instruções dele.
        </p>
        <p>
          Em relação às contas de acesso ao painel (nome, e-mail e registro de ações), a
          LINKA é a controladora.
        </p>
      </Secao>

      <Secao titulo="O que o aparelho envia">
        <p>Cada aparelho reporta, sobre si mesmo:</p>
        <Lista
          itens={[
            "Estado do aparelho: bateria, temperatura, tempo ligado, tela acesa ou apagada, tipo de conexão e força do sinal",
            "Identificação técnica: modelo, versão do Android, versão do aplicativo e um identificador do próprio aparelho",
            "Uso: blocos de interação (o que chamamos de visita), quais recursos foram abertos e por quanto tempo",
            "Toques no menu de testes da vitrine: qual recurso a pessoa escolheu experimentar",
            "Lista de aplicativos instalados depois da configuração de fábrica",
          ]}
        />
        <p>
          Tudo isso descreve <strong>o aparelho</strong>, não a pessoa. Não há nome, documento,
          telefone, e-mail, rosto, voz ou localização de visitante de loja em nenhum desses
          registros, e não há como chegar a uma pessoa a partir deles.
        </p>
      </Secao>

      <Secao titulo="O que a plataforma não faz">
        <Lista
          destaque
          itens={[
            "Não usa a câmera do aparelho para captar quem está na frente dele",
            "Não faz reconhecimento facial, estimativa de idade, gênero ou emoção",
            "Não trata dado biométrico, nenhum",
            "Não coleta localização: a permissão é negada pelo próprio sistema de gestão, não apenas “não pedida”",
            "Não grava áudio nem o conteúdo do que o visitante faz dentro dos aplicativos",
            "Não cruza os dados de um cliente com os de outro: a separação é garantida no banco de dados",
          ]}
        />
      </Secao>

      <Secao titulo="Fotos e dados deixados pelo visitante">
        <p>
          Um aparelho de demonstração é usado por muitas pessoas. Quem experimenta a câmera
          pode deixar fotos, e quem entra numa conta pode deixar sessão aberta.
        </p>
        <p>
          Por isso o aparelho executa uma <strong>limpeza diária</strong>, no horário definido
          pela operação: apaga as fotos e vídeos do armazenamento do aparelho e limpa os dados
          dos aplicativos de demonstração, incluindo sessões e histórico de navegação.{" "}
          <strong>Esse conteúdo é apagado no próprio aparelho e nunca é enviado para os nossos
          servidores.</strong>
        </p>
      </Secao>

      <Secao titulo="Contas de acesso ao painel">
        <p>
          Quem opera a plataforma tem uma conta com nome e e-mail. Registramos as ações
          sensíveis realizadas no painel: quem alterou o quê e quando, incluindo a liberação
          de um aparelho na loja com o PIN de manutenção.
        </p>
        <p>
          Isso existe para segurança e auditoria, com base no legítimo interesse de manter um
          registro de quem operou a frota, e no cumprimento das obrigações contratuais com o
          cliente.
        </p>
      </Secao>

      <Secao titulo="Com quem os dados são compartilhados">
        <p>
          Com o cliente contratante, que é quem os dados descrevem, e com os provedores de
          infraestrutura necessários para o serviço funcionar: hospedagem do banco de dados e
          da aplicação, envio de e-mail e notificações. Não vendemos dados e não os usamos para
          publicidade dirigida a pessoas.
        </p>
        <p>
          Os dados de operação ficam hospedados em <strong>servidores no Brasil</strong>.
        </p>
      </Secao>

      <Secao titulo="Por quanto tempo guardamos">
        <p>
          Os dados de medição são mantidos enquanto durar o contrato com o cliente, e podem ser
          eliminados a pedido dele. Encerrado o contrato, os dados são eliminados ou devolvidos
          conforme o que estiver acordado.
        </p>
      </Secao>

      <Secao titulo="Direitos">
        <p>
          A LGPD garante ao titular o direito de confirmar o tratamento, acessar, corrigir,
          eliminar, portar seus dados e revogar consentimento. Como a plataforma não identifica
          visitantes de loja, esses pedidos se aplicam na prática às contas de acesso ao painel.
        </p>
        <p>
          Pedidos relativos a dados de uma loja específica devem ser dirigidos ao cliente
          contratante, que é o controlador. Encaminhamos e apoiamos a resposta.
        </p>
      </Secao>

      <Secao titulo="Contato">
        <p>
          Encarregado pelo tratamento de dados pessoais:{" "}
          <a href="mailto:suporte@linkaretail.com.br" className="text-primary underline">
            suporte@linkaretail.com.br
          </a>
        </p>
        <p>
          Se a sua mensagem for sobre dados pessoais (acesso, correção ou exclusão), escreva
          isso no assunto. Ela é encaminhada ao encarregado e respondida nos prazos da LGPD.
        </p>
      </Secao>

      <p className="mt-12 border-t border-line pt-6 text-sm text-muted">
        Esta política descreve a plataforma LINKA. Alterações relevantes serão publicadas nesta
        página, com a data de atualização acima.
      </p>
    </main>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted">
        {children}
      </div>
    </section>
  );
}

function Lista({ itens, destaque = false }: { itens: string[]; destaque?: boolean }) {
  return (
    <ul className="flex flex-col gap-2">
      {itens.map((i) => (
        <li key={i} className="flex gap-2">
          <span className={destaque ? "text-primary" : "text-muted"}>·</span>
          <span>{i}</span>
        </li>
      ))}
    </ul>
  );
}
