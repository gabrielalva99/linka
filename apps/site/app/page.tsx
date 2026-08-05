import { LinkaLogo } from "./linka-logo";

/**
 * Página de vendas da LINKA.
 *
 * ── Para quem ela fala ────────────────────────────────────────────────────
 * Diretor de marketing de produto ou de trade de uma MARCA — quem paga pela
 * bancada e hoje não tem como saber o que acontece nela. Não é para o varejista
 * (que não compra isso) nem para técnico (que não decide).
 *
 * ── O que ela NÃO faz, e é decisão, não esquecimento ──────────────────────
 * 1. Não cita cliente. Sem contrato assinado e autorização por escrito, nome ou
 *    logo de marca em material de venda é risco jurídico e comercial — e é o
 *    tipo de coisa que queima a relação justamente com quem a gente quer.
 * 2. Não promete o que não existe. O bloco "para onde vai" está separado e
 *    rotulado. Numa indústria pequena, quem promete demais é cobrado em reunião,
 *    e a conta chega junto com a renovação.
 * 3. Não tem formulário. Sem CRM e sem alguém de plantão, formulário que ninguém
 *    responde é pior do que um e-mail direto.
 */

export default function Home() {
  return (
    <main>
      <Cabecalho />
      <Heroi />
      <Problema />
      <OQueFaz />
      <Tese />
      <Privacidade />
      <ParaOndeVai />
      <Fechamento />
      <Rodape />
    </main>
  );
}

function Cabecalho() {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-8">
      <LinkaLogo className="h-7 w-auto" />
      <a
        href="mailto:suporte@linkaretail.com.br?subject=LINKA%20—%20quero%20conhecer"
        className="rounded-lg border border-line px-4 py-2 text-sm text-muted transition-colors hover:border-primary hover:text-primary"
      >
        Falar com a gente
      </a>
    </header>
  );
}

function Heroi() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-24 pt-16 sm:pt-24">
      <p className="text-xs uppercase tracking-[0.15em] text-muted">
        Aparelhos de demonstração no varejo físico
      </p>
      <h1 className="mt-5 text-4xl font-semibold leading-[1.05] sm:text-6xl">
        Sua marca tem aparelhos
        <br />
        em dezenas de lojas.
        <br />
        <span className="text-primary">Hoje ninguém sabe o que acontece com eles.</span>
      </h1>
      <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted">
        A LINKA mantém cada aparelho de demonstração ligado, com a campanha certa e sob o
        controle da marca — e transforma o que o visitante faz na loja em número.
      </p>
    </section>
  );
}

function Problema() {
  return (
    <Secao titulo="Três perguntas que hoje não têm resposta">
      <div className="grid gap-6 sm:grid-cols-3">
        <Cartao
          titulo="O aparelho está ligado?"
          texto="Descobre-se quando o gerente da loja reclama — ou quando ninguém reclama e ele passa o mês apagado."
        />
        <Cartao
          titulo="Está com a campanha certa?"
          texto="A peça nova foi para quarenta lojas. Chegou em quantas? A resposta honesta hoje é: não dá para saber."
        />
        <Cartao
          titulo="Alguém experimentou?"
          texto="O aparelho existe para ser pego na mão. Não existe nenhum número sobre isso em lugar nenhum."
        />
      </div>
    </Secao>
  );
}

function OQueFaz() {
  return (
    <Secao
      titulo="O que a plataforma faz"
      subtitulo="Está no ar e funcionando. Nada aqui é projeto."
    >
      <div className="grid gap-6 sm:grid-cols-3">
        <Cartao
          selo="Controla"
          titulo="A vitrine é da marca"
          texto="Campanha certa em cada loja, no horário certo, trocada pelo painel e no ar em segundos. O visitante usa o aparelho à vontade e não consegue derrubá-lo: não desliga o Wi-Fi, não instala aplicativo, não deixa senha na tela."
        />
        <Cartao
          selo="Mede"
          titulo="Quem pegou, por quanto tempo, e o que quis testar"
          texto="Cada bloco de uso vira uma visita, com os recursos que a pessoa abriu. Câmera, som, tela, vídeo — medidos por aparelho, por loja e por hora do dia."
        />
        <Cartao
          selo="Opera à distância"
          titulo="Sem visita técnica para quase tudo"
          texto="Trocar conteúdo, limpar as fotos que o visitante deixou, atualizar o aplicativo da frota inteira e diagnosticar um aparelho — tudo do painel, sem ninguém dirigir até a loja."
        />
      </div>
    </Secao>
  );
}

function Tese() {
  return (
    <Secao
      titulo="O dado que a sua marca não tem"
      subtitulo="E não é por falta de investimento em pesquisa."
    >
      <div className="grid gap-6 sm:grid-cols-3">
        <PontoCego
          fonte="Sell-out"
          diz="Diz o que foi vendido."
          cego="Não diz o que foi desejado e não comprado."
        />
        <PontoCego
          fonte="Pesquisa de mercado"
          diz="Diz o que a pessoa lembra, depois."
          cego="Não diz o que ela fez na hora."
        />
        <PontoCego
          fonte="Contador de fluxo"
          diz="Diz quantos passaram pela porta."
          cego="Não diz por qual produto se interessaram."
        />
      </div>
      <p className="mt-10 rounded-xl border border-primary/40 bg-primary/5 px-6 py-5 text-base leading-relaxed">
        O aparelho de demonstração é o único lugar do varejo físico onde a pessoa{" "}
        <strong className="text-foreground">declara o que quer antes de comprar</strong> — ela pega,
        escolhe, testa. Hoje ninguém registra isso. É o que a LINKA mede.
      </p>
    </Secao>
  );
}

function Privacidade() {
  return (
    <Secao
      titulo="Medimos o aparelho, não a pessoa"
      subtitulo="Isso importa mais do que parece, e cada vez mais."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-6">
          <p className="text-sm leading-relaxed text-muted">
            Existe uma corrida no varejo para colocar câmera na prateleira, estimar idade e
            gênero de quem passa e escolher a oferta por isso. Imagem de rosto é{" "}
            <strong className="text-foreground">dado pessoal sensível</strong> na LGPD, exige
            consentimento específico — e já há condenação judicial no Brasil por fazer isso
            sem pedir.
          </p>
        </div>
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-6">
          <p className="text-sm leading-relaxed">
            A LINKA não usa câmera, não faz reconhecimento facial, não estima idade nem
            gênero, não trata dado biométrico e não coleta localização. Medimos interação com
            o aparelho.{" "}
            <strong className="text-foreground">
              Não há consentimento a obter porque não há pessoa identificada
            </strong>
            .
          </p>
        </div>
      </div>
      <p className="mt-6 text-sm text-muted">
        <a href="https://painel.linkaretail.com.br/privacidade" className="underline hover:text-primary">
          Política de privacidade
        </a>{" "}
        — específica desta plataforma, não um modelo genérico.
      </p>
    </Secao>
  );
}

function ParaOndeVai() {
  return (
    <Secao
      titulo="Para onde vai"
      subtitulo="Ainda não existe. Está aqui porque é o que a base já construída permite fazer."
    >
      <div className="grid gap-6 sm:grid-cols-3">
        <Cartao
          titulo="O aparelho avisa o vendedor"
          texto="Alguém com o seu lançamento na mão há noventa segundos é uma venda acontecendo agora, e ninguém na loja fica sabendo. O sinal já existe no aparelho."
        />
        <Cartao
          titulo="Prova de exposição automática"
          texto="A marca paga pelo espaço na bancada e a comprovação hoje é foto de promotor. Ligado, com a campanha certa, dentro do expediente: os três dados já são medidos."
        />
        <Cartao
          titulo="Teste A/B na loja física"
          texto="Peça A em metade das lojas, peça B na outra metade, mesma semana — e a plataforma diz qual segurou mais gente. É o que a marca faz há vinte anos no digital e nunca conseguiu na loja."
        />
      </div>
    </Secao>
  );
}

function Fechamento() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24">
      <div className="rounded-2xl border border-line bg-surface p-10 sm:p-14">
        <h2 className="text-2xl font-semibold sm:text-3xl">
          A plataforma está no ar. O piloto está em implantação.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Se a sua marca tem aparelhos de demonstração em loja e hoje não consegue dizer o que
          aconteceu com eles ontem, essa conversa é curta e a gente mostra funcionando.
        </p>
        <a
          href="mailto:suporte@linkaretail.com.br?subject=LINKA%20—%20quero%20conhecer"
          className="mt-8 inline-block rounded-lg bg-primary px-6 py-3 font-medium text-black transition-opacity hover:opacity-90"
        >
          suporte@linkaretail.com.br
        </a>
      </div>
    </section>
  );
}

function Rodape() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <LinkaLogo className="h-5 w-auto" />
        <div className="flex flex-wrap gap-6">
          <a href="https://painel.linkaretail.com.br/privacidade" className="hover:text-primary">
            Privacidade
          </a>
          <a href="https://painel.linkaretail.com.br" className="hover:text-primary">
            Acessar o painel
          </a>
          <a href="mailto:suporte@linkaretail.com.br" className="hover:text-primary">
            Contato
          </a>
        </div>
      </div>
    </footer>
  );
}

/* ── peças ─────────────────────────────────────────────────────────────── */

function Secao({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-5xl border-t border-line px-6 py-20">
      <h2 className="text-2xl font-semibold sm:text-3xl">{titulo}</h2>
      {subtitulo && <p className="mt-3 text-base text-muted">{subtitulo}</p>}
      <div className="mt-10">{children}</div>
    </section>
  );
}

function Cartao({ selo, titulo, texto }: { selo?: string; titulo: string; texto: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-6">
      {selo && (
        <span className="self-start rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
          {selo}
        </span>
      )}
      <h3 className="text-lg font-semibold leading-snug">{titulo}</h3>
      <p className="text-sm leading-relaxed text-muted">{texto}</p>
    </div>
  );
}

function PontoCego({ fonte, diz, cego }: { fonte: string; diz: string; cego: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-6">
      <h3 className="text-lg font-semibold">{fonte}</h3>
      <p className="text-sm text-muted">{diz}</p>
      <p className="mt-auto rounded-lg bg-background px-4 py-3 text-sm">
        <span className="block text-xs uppercase tracking-wider text-muted">Ponto cego</span>
        {cego}
      </p>
    </div>
  );
}
