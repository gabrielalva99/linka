import { LinkaLogo } from "./linka-logo";
import { RedeDeSinais } from "./rede-de-sinais";
import { CONTATO, CONTATO_MAILTO } from "./site";
import { IndiceLateral, RevelaSecoes } from "./indice";

/**
 * Página de vendas da LINKA.
 *
 * ── Para quem ela fala ────────────────────────────────────────────────────
 * Diretor de marketing de produto ou de trade de uma MARCA — quem paga pela
 * bancada e hoje não tem como saber o que acontece nela. Não é para o
 * varejista (que não compra isso) nem para técnico (que não decide).
 *
 * ── O argumento, e a âncora pública de cada seção ─────────────────────────
 *   herói                       a loja gera dado e quase nada é captado
 *   01 #perguntas-sem-resposta  a dor, em três linhas
 *   02 #dispositivos            qualquer dispositivo da loja é ponto de dado
 *   03 #plataforma              o que já opera, com o painel em vídeo
 *   04 #o-dado-que-falta        o ponto cego das fontes que a marca já paga ← pico
 *   05 #o-que-se-mede           o que a marca passa a saber
 *   06 #aplicacoes              o que ela decide com isso
 *   07 #como-comecar            que começar é simples
 *   fechamento                  o e-mail
 *
 * As âncoras são URL pública e não devem mudar: alguém vai colar
 * linkaretail.com.br/#o-dado-que-falta numa conversa. Regras em `indice.tsx`.
 *
 * ── O que ela NÃO faz, e é decisão, não esquecimento ──────────────────────
 * 1. Não cita cliente, não usa depoimento e não inventa resultado. Sem
 *    contrato e autorização por escrito, nome de marca em material de venda
 *    é risco jurídico e comercial.
 * 2. Não fala de roadmap. Ou a possibilidade é real e é vendida como
 *    aplicação, ou não entra na página.
 * 3. Não argumenta pelo que a plataforma deixa de fazer. O tratamento de
 *    dado vive na política de privacidade, linkada, não no discurso.
 * 4. Não expõe o acesso ao painel: o link vai por envio direto.
 * 5. Não tem formulário. Sem CRM e sem alguém de plantão, formulário que
 *    ninguém responde é pior do que um e-mail direto.
 */

/*
 * `overflow-x-clip` e não `overflow-x-hidden`.
 *
 * Os dois brilhos de fundo e o placeholder 16:9 estouram a largura no celular
 * e precisam ser cortados. Mas `overflow-x: hidden` transforma o <main> em
 * contêiner de rolagem, e aí o cabeçalho `sticky` para de grudar — conferido
 * no navegador: no meio da página ele sumia junto com o scroll.
 * `clip` corta igual e não cria contêiner de rolagem.
 */
export default function Home() {
  return (
    <main className="overflow-x-clip">
      <IndiceLateral />
      <RevelaSecoes />
      <Cabecalho />
      <Heroi />
      <Problema />
      <Dispositivos />
      <OQueFaz />
      <Tese />
      <Medicao />
      <Aplicacoes />
      <ComoEntra />
      <Fechamento />
      <Rodape />
    </main>
  );
}

function Cabecalho() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-12">
        <LinkaLogo className="h-6 w-auto shrink-0" />
        {/* O botão do cabeçalho é o discreto, o que fica sempre à vista. Ele
            NÃO repete a promessa do principal ("Ver a plataforma funcionando"):
            dois gritando a mesma coisa tiram força um do outro. */}
        <a
          href={CONTATO_MAILTO}
          className="shrink-0 rounded-sm border border-line px-4 py-2 text-[13px] font-medium text-muted transition-colors hover:border-primary hover:text-primary"
        >
          Entre em contato
        </a>
      </div>
    </header>
  );
}

function Heroi() {
  return (
    <section className="relative border-b border-line">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-0 h-[420px] w-[620px] rounded-full bg-primary/10 blur-[120px]"
      />
      {/* Malha de pontos: assinatura gráfica, some antes do texto de apoio. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--color-line)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.55),transparent_72%)]"
      />
      <div className="relative mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-12 px-5 pb-14 pt-14 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:px-12 lg:pb-20 lg:pt-24">
        <div>
          <div className="flex items-center gap-3">
            <span className="h-0.5 w-7 shrink-0 bg-primary" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
              Dispositivos conectados no varejo físico
            </p>
          </div>
          <h1 className="mt-6 text-[38px] font-bold leading-[0.98] tracking-[-0.03em] sm:text-5xl lg:text-[72px]">
            A loja física gera dado a cada toque.
            <br />
            <span className="text-primary">Hoje quase nada disso é captado.</span>
          </h1>
          <p className="mt-8 max-w-xl text-base leading-relaxed text-muted lg:mt-10 lg:text-[19px]">
            A LINKA conecta os dispositivos da loja a uma plataforma só: conteúdo sob controle da
            marca, operação à distância e medição do que o visitante fez ali. O aparelho de
            demonstração é onde o dado mais rico é jogado fora.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 lg:mt-10">
            {/*
              CADA BOTÃO DIZ O QUE ACONTECE AO CLICAR.
              Este abre o e-mail, então ele pede — não promete mostrar. Houve
              aqui um "Ver a plataforma funcionando" apontando para o `mailto`:
              o visitante clicava esperando ver e ganhava uma janela de e-mail.
              Promessa quebrada no primeiro clique é pior do que botão sem
              graça, porque queima a confiança no resto da página.
            */}
            <a
              href={CONTATO_MAILTO}
              className="rounded-md bg-primary px-5 py-3.5 text-[15px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Solicitar uma demonstração
            </a>
            {/* E este desce até a seção 03, onde o painel está rodando em
                vídeo. Aqui "ver funcionando" é verdade: é exatamente o que
                acontece. A promessa mudou para o botão que a cumpre. */}
            <a
              href="#plataforma"
              className="rounded-md border border-line px-5 py-3.5 text-[15px] font-medium text-muted transition-colors hover:border-primary hover:text-primary"
            >
              Ver a plataforma funcionando
            </a>
          </div>
        </div>
        <RedeDeSinais />
      </div>
    </section>
  );
}

/** Denso e sem cartão: três linhas separadas por fio, numeradas. */
function Problema() {
  const perguntas = [
    {
      pergunta: "O dispositivo está ligado?",
      resposta:
        "Descobre-se quando o gerente da loja reclama. Ou quando ninguém reclama e ele passa o mês apagado.",
    },
    {
      pergunta: "Está com a campanha certa?",
      resposta:
        "A peça nova foi para quarenta lojas. Chegou em quantas? Hoje não dá para saber.",
    },
    {
      pergunta: "Qual recurso o cliente mais procura?",
      resposta:
        "Câmera, tela, som, vídeo. A pessoa escolhe o que quer testar, e essa escolha desaparece no segundo seguinte.",
    },
  ];

  return (
    <section id="perguntas-sem-resposta" className="border-b border-line">
      <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <TituloSecao indice="01" titulo="Três perguntas que hoje não têm resposta" />
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Vale para o aparelho de demonstração, para o tablet do balcão e para a tela da bancada. É
          a mesma cegueira, repetida em cada dispositivo da loja.
        </p>
        <div className="mt-10 flex flex-col lg:mt-14">
          {perguntas.map((p, i) => (
            <div
              key={p.pergunta}
              className={`flex flex-wrap items-start gap-4 border-t border-line py-6 lg:gap-12 lg:py-9 ${
                i === perguntas.length - 1 ? "border-b" : ""
              }`}
            >
              <span className="w-10 shrink-0 pt-1.5 font-mono text-[13px] text-ink-500">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="min-w-0 flex-1 basis-[260px] text-[21px] font-semibold leading-tight tracking-[-0.015em] lg:text-[29px]">
                {p.pergunta}
              </h3>
              <p className="min-w-0 flex-1 basis-[320px] text-base leading-relaxed text-muted">
                {p.resposta}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Os quatro dispositivos têm o MESMO peso: a seção vende a possibilidade da
 * plataforma, não o escopo em operação. Fio no topo de cada célula (e não
 * divisória vertical) para a grade sobreviver a 4, 3, 2 e 1 coluna.
 */
function Dispositivos() {
  const tipos = [
    {
      titulo: "Aparelho de demonstração",
      texto:
        "A vitrine que o cliente pega na mão. É o dispositivo onde o interesse aparece antes da compra.",
      estado: "No ar" as const,
    },
    {
      titulo: "Tablet de atendimento",
      texto: "Catálogo, consulta e apoio ao vendedor, com o mesmo controle de conteúdo e de tela.",
      estado: "Sob demanda" as const,
    },
    {
      titulo: "Totem de autoatendimento",
      texto: "Interação sem intermediário: o que a pessoa procurou já é um dado de intenção.",
      estado: "Sob demanda" as const,
    },
    {
      titulo: "Tela de conteúdo na bancada",
      texto: "Campanha certa, no horário certo, com prova de que esteve no ar naquela loja.",
      estado: "Sob demanda" as const,
    },
  ];

  return (
    <section id="dispositivos" className="border-b border-line bg-ink-950">
      <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <TituloSecao indice="02" titulo="Um dispositivo na loja é um ponto de dado" />
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
          A plataforma trata dispositivo como frota: registra, publica conteúdo, monitora e mede.
          Vale para o aparelho que o cliente pega na mão, para o tablet do vendedor, para o totem e
          para a tela da bancada. O que muda de um para o outro é o conteúdo e o que se mede, não a
          base.
        </p>
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:mt-14 lg:grid-cols-4">
          {tipos.map((t) => (
            <div key={t.titulo} className="border-t border-line py-6 pr-5 lg:py-8 lg:pr-7">
              <Estado>{t.estado}</Estado>
              <h3 className="mt-3 text-[19px] font-semibold leading-snug">{t.titulo}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">{t.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Respirado: o print do painel manda na seção, os cartões vêm depois. */
function OQueFaz() {
  const blocos = [
    {
      selo: "Gestão de conteúdo",
      titulo: "A vitrine é da marca",
      texto:
        "Campanha certa em cada loja, no horário certo, trocada pelo painel e no ar em segundos. O visitante usa o dispositivo à vontade e não consegue derrubá-lo: não desliga o Wi-Fi, não instala aplicativo, não deixa senha na tela.",
    },
    {
      selo: "Dados e métricas",
      titulo: "Quem pegou, por quanto tempo, e o que quis testar",
      texto:
        "Cada bloco de uso vira uma visita, com os recursos que a pessoa abriu. Câmera, som, tela, vídeo. Tudo medido por dispositivo, por loja e por hora do dia.",
    },
    {
      selo: "Operação da frota",
      titulo: "Sem visita técnica para quase tudo",
      texto:
        "Trocar conteúdo, limpar as fotos que o visitante deixou, atualizar o aplicativo da frota inteira e diagnosticar um dispositivo: tudo do painel, sem ninguém dirigir até a loja.",
    },
  ];

  return (
    <section id="plataforma" className="border-b border-line">
      <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-8 lg:px-12 lg:py-28">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <TituloSecao indice="03" titulo="O que a plataforma faz" />
          {/* Aqui NÃO se afirma que a plataforma existe. Quem diz "isto é real"
              é quem está sendo duvidado, e a frase levanta a suspeita que o
              leitor ainda não tinha. O lugar dessa linha é dar informação. */}
          <p className="text-[15px] text-muted">Conteúdo, dados e operação num painel só.</p>
        </div>

        <PainelEmMovimento />

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:mt-8 lg:grid-cols-3">
          {blocos.map((b) => (
            <div
              key={b.titulo}
              className="flex flex-col gap-3.5 rounded-lg border border-line bg-surface p-6 transition-colors hover:border-ink-600 lg:p-7"
            >
              <span className="self-start rounded-sm border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
                {b.selo}
              </span>
              <h3 className="text-xl font-semibold leading-snug tracking-[-0.01em]">{b.titulo}</h3>
              <p className="text-[15px] leading-relaxed text-muted">{b.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * O painel respondendo as três perguntas da seção 01.
 *
 * O arquivo é renderizado por código em `apps/studio` (Remotion) e commitado
 * pronto — ninguém renderiza vídeo em produção. 1,6 MB, 1440×810, 30 s.
 *
 * ── As quatro coisas que fazem vídeo em página não ser um erro ─────────────
 * 1. `muted` + `playsInline`: sem os dois o navegador BLOQUEIA o autoplay e o
 *    bloco fica congelado no poster. É a causa nº 1 de "o vídeo não roda".
 * 2. `poster` + `preload="none"`: o quadro aparece na hora e o 4,1 MB só sai
 *    da rede quando precisa — ele está abaixo da dobra, não pode competir com
 *    o texto que o visitante veio ler.
 * 3. `prefers-reduced-motion`: quem pediu ao sistema para parar de animar vê o
 *    quadro parado. Não é enfeite — é gente que passa mal com movimento.
 * 4. Sem `controls`: é peça de página, não vídeo para assistir. Barra de
 *    controle convida a pausar e some com a leitura.
 *
 * ── Sem borda no bloco ────────────────────────────────────────────────────
 * O vídeo já traz a moldura do painel dentro dele; as duas juntas viram caixa
 * dentro de caixa. O fundo do vídeo é o mesmo preto da página, então ele se
 * dissolve na página e sobra só o produto.
 */
function PainelEmMovimento() {
  return (
    <div className="mt-8 lg:mt-12">
      <img src="/painel.jpg" alt="" aria-hidden className="hidden w-full motion-reduce:block" />
      <video
        className="block w-full motion-reduce:hidden"
        autoPlay
        loop
        muted
        playsInline
        preload="none"
        poster="/painel.jpg"
        aria-hidden
      >
        <source src="/painel.mp4" type="video/mp4" />
      </video>
    </div>
  );
}

/**
 * PICO DA PÁGINA.
 * Fundo próprio, tipo do tamanho do herói, e a matriz "diz / ponto cego" —
 * o contraste é o argumento, então ele é a forma da seção, não um cartão.
 */
function Tese() {
  const fontes = [
    {
      fonte: "Sell-out",
      diz: "Diz o que foi vendido.",
      cego: "Não diz o que foi desejado e não comprado.",
    },
    {
      fonte: "Pesquisa de mercado",
      diz: "Diz o que a pessoa lembra, depois.",
      cego: "Não diz o que ela fez na hora.",
    },
    {
      fonte: "Contador de fluxo",
      diz: "Diz quantos passaram pela porta.",
      cego: "Não diz por qual produto se interessaram.",
    },
  ];

  return (
    <section id="o-dado-que-falta" className="relative border-b border-line bg-surface">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-0 h-[500px] w-[760px] rounded-full bg-primary/10 blur-[130px]"
      />
      <div className="relative mx-auto max-w-[1240px] px-5 py-24 sm:px-8 lg:px-12 lg:py-40">
        <div className="flex items-center gap-3.5">
          <span className="font-mono text-xs tracking-[0.16em] text-primary">04</span>
          <span className="h-px w-14 bg-primary/50" />
        </div>
        <h2 className="mt-5 max-w-4xl text-[34px] font-bold leading-[0.97] tracking-[-0.035em] sm:text-6xl lg:text-[76px]">
          O dado que a sua marca não tem
        </h2>
        <p className="mt-5 text-base text-muted lg:text-xl">
          E não é por falta de investimento em pesquisa.
        </p>

        <div className="mt-12 flex flex-col gap-px overflow-hidden rounded-lg border border-line bg-line lg:mt-20">
          {fontes.map((f) => (
            <div
              key={f.fonte}
              className="flex flex-wrap items-start gap-4 bg-background p-6 lg:gap-10 lg:p-9"
            >
              <h3 className="min-w-0 flex-1 basis-[220px] text-[22px] font-bold leading-tight tracking-[-0.02em] lg:text-[32px]">
                {f.fonte}
              </h3>
              <div className="min-w-0 flex-1 basis-[240px]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                  Diz
                </p>
                <p className="mt-2.5 text-[17px] leading-snug text-foreground">{f.diz}</p>
              </div>
              <div className="min-w-0 flex-1 basis-[280px] rounded-r-md border-l-2 border-primary bg-surface bg-[repeating-linear-gradient(135deg,var(--color-ink-700)_0_3px,transparent_3px_9px)] px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                  Ponto cego
                </p>
                <p className="mt-2.5 text-[17px] leading-snug text-brand-100">{f.cego}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 max-w-4xl border-l-[3px] border-primary pl-5 lg:mt-16 lg:pl-11">
          <p className="text-[22px] font-semibold leading-[1.22] tracking-[-0.02em] lg:text-[40px]">
            O dispositivo que a pessoa toca é o único lugar do varejo físico onde ela{" "}
            <span className="text-primary">declara o que quer antes de comprar</span>: ela pega,
            escolhe, testa. Hoje ninguém registra isso. É o que a LINKA mede.
          </p>
        </div>
      </div>
    </section>
  );
}

/** O que a marca passa a saber. Afirmativo: fala do dado que existe. */
function Medicao() {
  const eixos = [
    {
      selo: "Interesse por produto",
      texto:
        "Quais modelos foram pegos e comparados na bancada, e quais ficaram parados na mesma loja e na mesma semana.",
    },
    {
      selo: "Interesse por recurso",
      texto:
        "Câmera, som, tela, vídeo: o que a pessoa foi testar primeiro diz por qual argumento ela está decidindo.",
    },
    {
      selo: "Loja, dia e hora",
      texto:
        "A mesma métrica comparável entre lojas e entre regiões, para decidir campanha, sortimento e espaço na bancada.",
    },
  ];

  return (
    <section id="o-que-se-mede" className="border-b border-line">
      <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:px-12 lg:py-36">
        <div className="max-w-3xl">
          <TituloSecao indice="05" titulo="O que a marca passa a saber" />
          <p className="mt-4 text-base text-muted">
            Dado de loja com a mesma granularidade que a marca já tem no digital.
          </p>
        </div>
        <p className="mt-10 max-w-4xl text-[19px] font-medium leading-[1.4] tracking-[-0.015em] text-brand-100 lg:mt-16 lg:text-[28px]">
          Cada interação com o dispositivo virá registrada:{" "}
          <span className="text-foreground">
            qual produto foi pego, qual recurso foi aberto, por quanto tempo, em qual loja e em qual
            hora
          </span>
          . É o comportamento de compra que hoje acontece e não deixa rastro.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-0 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3">
          {eixos.map((e) => (
            <div key={e.selo} className="border-t border-line py-6 pr-5 lg:py-7 lg:pr-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                {e.selo}
              </p>
              <p className="mt-3.5 text-[15px] leading-relaxed text-muted">{e.texto}</p>
            </div>
          ))}
        </div>
        {/*
          Sem contraste com câmera aqui. O jurídico está estudando a
          possibilidade de a própria LINKA medir por imagem; atacar hoje o que
          pode virar produto amanhã sai caro, e página de venda é o pior lugar
          para uma posição que ainda não está decidida.
        */}
        <p className="mt-8 text-sm text-muted">
          Como esse dado é tratado está na nossa{" "}
          <a href="/privacidade" className="border-b border-line text-brand-100 hover:text-primary">
            política de privacidade
          </a>
          .
        </p>
      </div>
    </section>
  );
}

/**
 * O que a marca decide com o dado.
 *
 * Cada cartão é um link, e o assunto do e-mail já vem escrito com o nome da
 * aplicação. É o mecanismo mais barato que existe para descobrir por qual
 * delas o lead veio: sem CRM, sem formulário e sem alguém de plantão, a
 * própria caixa de entrada vira o relatório de interesse.
 */
function Aplicacoes() {
  const usos = [
    {
      titulo: "Comprovar a exposição que a marca paga",
      texto:
        "Ligado, com a campanha certa e dentro do expediente: três dados medidos por loja e por dia. É a prova do espaço contratado na bancada, sem depender de foto de promotor.",
      estado: "Sob demanda" as const,
    },
    {
      titulo: "Comparar peça A e peça B na loja física",
      texto:
        "Uma peça em um grupo de lojas, outra em um segundo grupo, mesma semana. O tempo de uso por bancada diz qual segurou mais gente. É o teste que a marca faz no digital há vinte anos.",
      estado: "Sob demanda" as const,
    },
    {
      titulo: "Ler o interesse no dia em que ele acontece",
      texto:
        "Interesse por modelo e por recurso, loja por loja, hora por hora. Serve para ajustar campanha, sortimento e argumento de venda dentro da semana, não no fechamento do trimestre.",
      estado: "Sob demanda" as const,
    },
  ];

  return (
    <section id="aplicacoes" className="border-b border-line">
      <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <TituloSecao indice="06" titulo="O que a marca faz com esse dado" />
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Três decisões que hoje são tomadas por intuição e passam a ter número por trás. Clique na
          que interessa e a gente marca uma conversa sobre ela.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:mt-14 lg:grid-cols-3">
          {usos.map((u) => (
            <a
              key={u.titulo}
              href={`mailto:${CONTATO}?subject=${encodeURIComponent(u.titulo)}`}
              className="group flex flex-col gap-3 rounded-lg border border-line bg-surface p-6 transition-colors hover:border-primary/50 lg:p-7"
            >
              <Estado>{u.estado}</Estado>
              <h3 className="text-xl font-semibold leading-snug tracking-[-0.01em]">{u.titulo}</h3>
              <p className="text-[15px] leading-relaxed text-muted">{u.texto}</p>
              <span className="mt-auto pt-2 text-[13px] font-medium text-muted transition-colors group-hover:text-primary">
                Quero falar sobre isso
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Como começa: três passos ligados por fio, com marcador verde. */
function ComoEntra() {
  const passos = [
    {
      titulo: "Dispositivo preparado",
      texto:
        "A gente configura e registra o aparelho na frota da sua marca. Chega na loja pronto: é ligar e ele já aparece no painel.",
    },
    {
      titulo: "Conteúdo publicado",
      texto:
        "A campanha sobe uma vez e vai para as lojas que você escolher, no horário que você definir, em segundos.",
    },
    {
      titulo: "Dado no painel",
      texto:
        "Do primeiro toque em diante, cada uso vira visita: por loja, por dispositivo e por hora do dia.",
    },
  ];

  return (
    <section id="como-comecar" className="border-b border-line bg-ink-950">
      <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <TituloSecao indice="07" titulo="Como entra na sua rede" />
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Sem obra na loja e sem integração com o sistema do varejista. O dispositivo chega pronto e
          o painel é da sua marca desde o primeiro dia.
        </p>
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:mt-14 lg:grid-cols-3">
          {passos.map((p, i) => (
            <div key={p.titulo} className="relative border-t border-line py-7 pr-5 lg:py-8 lg:pr-7">
              <span aria-hidden className="absolute -top-1 left-0 size-[7px] rounded-full bg-primary" />
              <span className="font-mono text-xs tracking-[0.16em] text-ink-500">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3.5 text-xl font-semibold leading-snug tracking-[-0.01em]">
                {p.titulo}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{p.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Fechamento() {
  return (
    <section className="border-b border-line bg-ink-950">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-end justify-between gap-8 px-5 py-20 sm:px-8 lg:gap-16 lg:px-12 lg:py-36">
        <div className="min-w-0 max-w-3xl flex-1 basis-[460px]">
          <h2 className="text-[28px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-4xl lg:text-[52px]">
            O dado já acontece na sua loja hoje.
            <br />
            Ele só não é registrado.
          </h2>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted lg:text-[19px]">
            Se a sua marca tem dispositivos em loja e hoje não consegue dizer o que aconteceu com
            eles ontem, essa conversa é curta e a gente mostra ao vivo.
          </p>
        </div>
        <a
          href={CONTATO_MAILTO}
          className="shrink-0 rounded-md bg-primary px-7 py-4 font-semibold tracking-[-0.01em] text-primary-foreground transition-opacity hover:opacity-90 lg:text-lg"
        >
          {CONTATO}
        </a>
      </div>
    </section>
  );
}

/** O acesso ao painel NÃO é exposto aqui: o link vai por envio direto. */
function Rodape() {
  return (
    <footer>
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-5 px-5 py-10 text-sm text-muted sm:px-8 lg:px-12 lg:py-12">
        <LinkaLogo className="h-[18px] w-auto shrink-0" />
        <div className="flex flex-wrap gap-6">
          <a href="/privacidade" className="hover:text-primary">
            Privacidade
          </a>
          <a href={`mailto:${CONTATO}`} className="hover:text-primary">
            Contato
          </a>
        </div>
      </div>
    </footer>
  );
}

/* ── peças ─────────────────────────────────────────────────────────────── */

/**
 * O selo de estado — "No ar" ou "Sob demanda".
 *
 * ── Por que ele existe ────────────────────────────────────────────────────
 * A página vende a plataforma inteira, e não só a parte que já roda. Decisão
 * do Gabriel, e é comercialmente certa: quem só fala do que já opera nunca
 * descobre por qual coisa o lead se interessou.
 *
 * O selo separa as duas coisas em duas palavras, sem tirar nada da página. O
 * que não pode acontecer é afirmar no presente que algo já opera quando ainda
 * não opera — esse é o único ponto em que isso deixa de ser posicionamento e
 * vira problema (CDC, art. 37), e é o que queima a relação com a marca na
 * primeira reunião técnica.
 *
 * ── Por que "Sob demanda" e não "Na implantação" ──────────────────────────
 * "Na implantação" lê como obra em andamento. "Sob demanda" lê como módulo do
 * produto que se ativa quando o cliente quiser — que é o que a gente quer que
 * o leitor entenda. A palavra muda a leitura inteira do selo.
 *
 * Prazo não entra aqui. Cronograma escrito em site público vira promessa, e
 * o prazo é assunto da conversa, que é justamente o que a página quer gerar.
 */
function Estado({ children }: { children: "No ar" | "Sob demanda" }) {
  const noAr = children === "No ar";
  return (
    <span
      // `self-start` porque dentro de um cartão `flex-col` o selo esticaria
      // de ponta a ponta e viraria uma faixa.
      className={`inline-flex shrink-0 self-start items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
        noAr ? "border-primary/40 bg-primary/10 text-primary" : "border-line text-ink-500"
      }`}
    >
      <span className={`size-1.5 rounded-full ${noAr ? "bg-primary" : "bg-ink-500"}`} />
      {children}
    </span>
  );
}

function TituloSecao({ indice, titulo }: { indice: string; titulo: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-4">
      <span className="font-mono text-xs tracking-[0.16em] text-primary">{indice}</span>
      <h2 className="text-[26px] font-bold leading-[1.05] tracking-[-0.02em] lg:text-[42px]">
        {titulo}
      </h2>
    </div>
  );
}
