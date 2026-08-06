import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COR, PILHA_DE_FONTE } from "../marca";
import { CENA, emCadeia, ENTRA, ESTALO, SAI } from "../curvas";

/**
 * Os cartões do painel, reconstruídos em DOM.
 *
 * ── A regra mais importante deste arquivo ─────────────────────────────────
 * `moldura` é quando o cartão aparece; `conteudo` é quando ele COMEÇA A
 * ANIMAR. Os dois são separados de propósito.
 *
 * Antes eram a mesma coisa, e o resultado era o pior defeito da peça: as
 * linhas da frota entrando, as oito lojas sendo marcadas, o contador subindo,
 * as barras crescendo — tudo rodava atrás da cortina da pergunta, a 18% de
 * visibilidade. A cortina levantava num cartão JÁ MONTADO, que depois ficava
 * parado dois a quatro segundos. O espectador nunca via a ação, só a espera.
 * Era isso que fazia a peça parecer corrida e arrastada ao mesmo tempo.
 *
 * A moldura entra cedo (debaixo da cortina, para a tela não ficar vazia). O
 * conteúdo só começa quando a cena está limpa.
 *
 * ── Nada liga num quadro ──────────────────────────────────────────────────
 * Não existe booleano de estado aqui. Caixa marcada, célula acesa, rótulo de
 * botão: tudo é progresso interpolado. Oito caixas piscando em sequência
 * continuam sendo oito piscadas — só que em ordem.
 *
 * ── Fidelidade ────────────────────────────────────────────────────────────
 * Cores, raios e tipografia saem dos tokens da marca — os mesmos do painel de
 * verdade. Os textos e números são os da rede de demonstração.
 */

/** A moldura de vidro que segura qualquer cartão sobre a imagem de loja. */
export function Cartao({
  titulo,
  selo,
  moldura,
  /** Quantos quadros a cena inteira dura. Governa a deriva secundária. */
  duracao,
  /**
   * Quadro (local à cena) em que o cartão começa a SAIR.
   *
   * Existe para a versão gráfica. Lá o fundo é contínuo e não há cortina de
   * 82% para esconder a troca, então o cartão precisa se despedir por conta
   * própria — recua, desfoca e sobe — em vez de ser simplesmente coberto.
   * Sem isto ele some junto com a cena e o corte aparece.
   *
   * Na versão com imagem de loja fica indefinido: lá o comportamento antigo
   * está validado e não se mexe nele para acomodar a nova.
   */
  saidaEm,
  /**
   * Trava o cartão em pixel cheio depois que ele termina de entrar.
   *
   * ── Por que isto existe ─────────────────────────────────────────────────
   * Transformação contínua em cima de TEXTO faz a letra ferver. Deslocamento
   * e escala fracionários obrigam o navegador a re-rasterizar cada glifo a
   * cada quadro, e o antisserrilhado muda junto — a tabela inteira parece
   * tremer. Num cartão com sete linhas de tabela e números, é a primeira
   * coisa que incomoda quem assiste, mesmo sem saber apontar o quê.
   *
   * A deriva e a contra-escala existiam para o cartão não parecer adesivo
   * colado na lente. O preço não vale: quem mantém a cena viva é o FUNDO —
   * a rede se mexe atrás do vidro e o `backdropFilter` reamostra sozinho.
   * Movimento no leito, tipografia parada.
   */
  ancorado = false,
  largura = 1290,
  children,
}: {
  titulo: string;
  selo?: React.ReactNode;
  moldura: number;
  duracao: number;
  saidaEm?: number;
  ancorado?: boolean;
  largura?: number;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [moldura, moldura + 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRA,
  });
  const s =
    saidaEm === undefined
      ? 1
      : interpolate(frame, [saidaEm, saidaEm + 34], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: SAI,
        });

  /**
   * Movimento secundário — só na peça com imagem de loja.
   *
   * Lá o fundo dá zoom para a frente e o cartão precisa reagir, senão lê como
   * adesivo colado na lente. Aqui o custo é a tipografia fervendo (ver
   * `ancorado`), e na versão gráfica o fundo já cumpre esse papel sozinho.
   */
  const andado = ancorado ? 0 : Math.max(0, frame - moldura) / Math.max(1, duracao);
  const deriva = ancorado ? 0 : Math.sin((frame - moldura) / 47) * 4;

  return (
    <div
      style={{
        width: largura,
        borderRadius: 20,
        border: `1px solid ${COR.linha}`,
        background: `${COR.superficie}f2`,
        backdropFilter: "blur(18px)",
        boxShadow: "0 44px 96px rgba(0,0,0,0.58)",
        overflow: "hidden",
        fontFamily: PILHA_DE_FONTE,
        opacity: p * s,
        // O desfoque saindo tira o ar de "div que apareceu".
        // Na saída ele volta, e mais forte: o cartão recua para dentro do
        // fundo em vez de desbotar em cima dele.
        // Assentado, o filtro sai de cena por completo: `blur(0px)` ainda
        // manda o texto pelo caminho de rasterização do filtro, e o objetivo
        // aqui é o cartão parado ser pixel idêntico a ele mesmo.
        filter: p >= 1 && s >= 1 ? undefined : `blur(${(1 - p) * 9 + (1 - s) * 14}px)`,
        translate: `0px ${(1 - p) * 56 + deriva - (1 - s) * 40}px`,
        scale: (0.94 + p * 0.06) * (1 - 0.012 * andado) * (0.96 + s * 0.04),
      }}
    >
      <div
        style={{
          height: 78,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 34px",
          borderBottom: `1px solid ${COR.linha}`,
        }}
      >
        <span style={{ fontSize: 26, fontWeight: 600, color: COR.texto, letterSpacing: "-0.01em" }}>
          {titulo}
        </span>
        {selo}
      </div>
      <div style={{ padding: "26px 34px 30px" }}>{children}</div>
    </div>
  );
}

function Selo({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 15,
        fontWeight: 600,
        letterSpacing: "0.05em",
        color: COR.fraco,
        border: `1px solid ${COR.linha}`,
        borderRadius: 999,
        padding: "5px 14px",
      }}
    >
      {children}
    </span>
  );
}

/* ── a frota, respondendo "o aparelho está ligado?" ───────────────────────── */

/**
 * Nenhum valor de `seg` abaixo de 10, de propósito.
 *
 * O contador anda junto com a peça (`desde`), então "9 s" virava "10 s" um
 * segundo depois do cartão assentar — a linha ganhava um dígito e o texto
 * pulava para a direita. Uma linha de tabela mexendo sozinha, no exato momento
 * em que tudo o mais parou, é o tipo de coisa que o olho pega sem saber
 * apontar. Com todos começando em dois dígitos, nada reposiciona em 9 s de
 * cena. Se mexer aqui, confira que `seg + 9` continua com dois dígitos.
 */
const FROTA = [
  { cod: "DM001", nome: "Bancada 01", loja: "Loja Centro", ok: true, seg: 20 },
  { cod: "DM002", nome: "Bancada 02", loja: "Loja Centro", ok: true, seg: 12 },
  { cod: "DM003", nome: "Bancada 03", loja: "Loja Norte", ok: false, seg: null },
  { cod: "DM004", nome: "Bancada 01", loja: "Loja Norte", ok: true, seg: 44 },
  { cod: "DM005", nome: "Bancada 02", loja: "Loja Sul", ok: true, seg: 10 },
  { cod: "DM006", nome: "Bancada 03", loja: "Loja Sul", ok: false, seg: null },
  { cod: "DM007", nome: "Bancada 01", loja: "Loja Leste", ok: true, seg: 26 },
];

export function CartaoFrota({
  moldura,
  conteudo,
  duracao,
  saidaEm,
  ancorado,
}: {
  moldura: number;
  conteudo: number;
  duracao: number;
  saidaEm?: number;
  ancorado?: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  /** As linhas assentam como frota chegando: começa esparso e comprime. */
  const ULTIMA = conteudo + emCadeia(FROTA.length - 1, FROTA.length, 62) + 22;
  /** O aviso é a punhalada do cartão. Cai sozinho, depois de tudo assentar. */
  const aviso = interpolate(frame, [ULTIMA + 14, ULTIMA + 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRA,
  });

  return (
    <Cartao
      titulo="Frota · 96 aparelhos"
      duracao={duracao}
      moldura={moldura}
      saidaEm={saidaEm}
      ancorado={ancorado}
      selo={<Selo>Atualizado agora</Selo>}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "15px 22px",
          marginBottom: 18,
          borderRadius: 12,
          border: `1px solid ${COR.alerta}55`,
          background: `${COR.alerta}14`,
          opacity: aviso,
          translate: `0px ${(1 - aviso) * -18}px`,
        }}
      >
        <span
          style={{
            width: 11,
            height: 11,
            borderRadius: 999,
            background: COR.alerta,
            boxShadow: `0 0 ${16 * aviso}px ${COR.alerta}`,
          }}
        />
        <span style={{ fontSize: 21, fontWeight: 600, color: COR.texto }}>
          2 aparelhos apagados
        </span>
        <span style={{ fontSize: 21, color: COR.fraco }}>· Loja Norte, Loja Sul</span>
      </div>

      <Colunas titulos={["Situação", "Código", "Aparelho", "Loja", "Últ. contato"]} />

      {FROTA.map((d, i) => {
        const entra = conteudo + emCadeia(i, FROTA.length, 62);
        const p = interpolate(frame, [entra, entra + 22], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ENTRA,
        });
        /** O LED estala depois da linha assentar — é o único acento aqui. */
        const acende = interpolate(frame, [entra + 14, entra + 26], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ESTALO,
        });
        const cor = d.ok ? COR.verde : COR.alerta;

        /**
         * Os segundos correndo.
         *
         * Um produto de monitoramento ao vivo exibindo "20 s · 9 s · 4 h"
         * congelados por oito segundos é a coisa mais fácil de o olho pegar.
         * Agora o contador anda junto com a peça.
         */
        const desde = Math.max(0, Math.floor((frame - conteudo) / fps));
        const quando = d.seg === null ? "4 h" : `${d.seg + desde} s`;

        return (
          <div
            key={d.cod}
            style={{
              display: "grid",
              gridTemplateColumns: "190px 130px 1fr 1fr 150px",
              alignItems: "center",
              padding: "13px 10px",
              borderRadius: 9,
              background: d.ok ? "transparent" : `${COR.alerta}0f`,
              opacity: p,
              translate: `0px ${(1 - p) * 8}px`,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: cor,
                  opacity: acende,
                  scale: 0.4 + acende * 0.6,
                  boxShadow: `0 0 ${12 * acende}px ${cor}`,
                }}
              />
              <span style={{ fontSize: 20, fontWeight: 600, color: cor, opacity: acende }}>
                {d.ok ? "No ar" : "Fora do ar"}
              </span>
            </span>
            <span style={{ fontSize: 20, color: COR.fraco }}>{d.cod}</span>
            <span style={{ fontSize: 20, color: COR.texto, fontWeight: 500 }}>{d.nome}</span>
            <span style={{ fontSize: 20, color: COR.fraco }}>{d.loja}</span>
            <span style={{ fontSize: 20, color: COR.fraco }}>{quando}</span>
          </div>
        );
      })}
    </Cartao>
  );
}

/* ── publicar, respondendo "está com a campanha certa?" ───────────────────── */

const LOJAS = [
  "Loja Centro",
  "Loja Norte",
  "Loja Sul",
  "Loja Leste",
  "Loja Praça",
  "Loja Terminal",
  "Loja Parque",
  "Loja Estação",
];

export function CartaoPublicar({
  moldura,
  conteudo,
  duracao,
  saidaEm,
  ancorado,
}: {
  moldura: number;
  conteudo: number;
  duracao: number;
  saidaEm?: number;
  ancorado?: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  /** Progresso contínuo da seleção. Cada caixa lê sua fatia deste número. */
  const selecao = interpolate(frame, [conteudo, conteudo + 74], [0, LOJAS.length], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: CENA,
  });

  const CLICA = conteudo + 92;
  const PUBLICA = CLICA + 26;

  const publicando = interpolate(frame, [CLICA, PUBLICA], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: CENA,
  });
  /** A troca do rótulo é cruzada, não instantânea. */
  const virou = interpolate(frame, [PUBLICA, PUBLICA + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRA,
  });
  const onda = interpolate(frame, [PUBLICA + 6, PUBLICA + 64], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: CENA,
  });

  const lojas = Math.floor(selecao);
  /** O contador de aparelhos persegue o de lojas, alguns quadros atrás. */
  const aparelhos = Math.round(
    interpolate(frame, [conteudo + 5, conteudo + 79], [0, LOJAS.length * 12], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: CENA,
    }),
  );

  return (
    <Cartao
      titulo="Conteúdo · Campanha de agosto"
      moldura={moldura}
      duracao={duracao}
      saidaEm={saidaEm}
      ancorado={ancorado}
    >
      <div style={{ display: "flex", gap: 30 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
          <Rotulo>Onde publicar</Rotulo>
          {LOJAS.map((loja, i) => {
            /* Cada caixa tem o próprio progresso: a borda, o preenchimento e
               o check crescem juntos em vez de ligar num quadro. */
            const c = interpolate(selecao, [i, i + 0.85], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={loja}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 13,
                  padding: "10px 15px",
                  borderRadius: 9,
                  background: `rgba(0, 242, 79, ${0.07 * c})`,
                  border: `1px solid ${misturar(COR.linha, COR.verde, c * 0.55)}`,
                }}
              >
                <span
                  style={{
                    width: 21,
                    height: 21,
                    borderRadius: 6,
                    border: `2px solid ${misturar(COR.linha, COR.verde, c)}`,
                    background: `rgba(0, 242, 79, ${c})`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="12" height="9" viewBox="0 0 13 10" style={{ scale: 0.4 + c * 0.6, opacity: c }}>
                    <path
                      d="M1 5 L5 9 L12 1"
                      fill="none"
                      stroke={COR.fundo}
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span style={{ fontSize: 20, color: misturar(COR.fraco, COR.texto, c) }}>
                  {loja}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ width: 470, display: "flex", flexDirection: "column", gap: 14 }}>
          <Rotulo>Alcance</Rotulo>
          <div
            style={{
              padding: "22px 26px",
              borderRadius: 12,
              border: `1px solid ${COR.linha}`,
              background: COR.fundo,
              display: "flex",
              alignItems: "baseline",
              gap: 11,
            }}
          >
            {/* 8 lojas → um dígito · 96 aparelhos → dois. */}
            <Numero reserva={30}>{lojas}</Numero>
            <span style={{ fontSize: 22, color: COR.fraco }}>lojas</span>
            <span style={{ fontSize: 22, color: COR.linha }}>·</span>
            <Numero reserva={60}>{aparelhos}</Numero>
            <span style={{ fontSize: 22, color: COR.fraco }}>aparelhos</span>
          </div>

          <div
            style={{
              borderRadius: 12,
              background: COR.verde,
              padding: "18px 26px",
              height: 66,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              overflow: "hidden",
              scale: 1 - 0.02 * Math.max(0, 1 - Math.abs((frame - CLICA) / 8)),
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                width: `${publicando * (1 - virou) * 100}%`,
                background: COR.verdeClaro,
              }}
            />
            {/* os dois rótulos se cruzam, um sobe e o outro entra por baixo */}
            <span style={{ position: "absolute", opacity: 1 - virou, translate: `0px ${-virou * 10}px`, fontSize: 24, fontWeight: 700, color: COR.fundo }}>
              Publicar
            </span>
            <span style={{ position: "absolute", opacity: virou, translate: `0px ${(1 - virou) * 12}px`, fontSize: 24, fontWeight: 700, color: COR.fundo }}>
              No ar em 8 segundos
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(16, 1fr)",
              gap: 6,
              opacity: interpolate(frame, [PUBLICA, PUBLICA + 12], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            {Array.from({ length: 96 }, (_, i) => {
              // A onda varre por coluna e escorre pelas linhas. Cada célula tem
              // rampa própria: acender num quadro é pisca-pisca, mesmo em ordem.
              const limiar = (i % 16) / 16 + Math.floor(i / 16) * 0.035;
              const cel = interpolate(onda, [limiar, limiar + 0.1], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return (
                <span
                  key={i}
                  style={{
                    aspectRatio: "1 / 1.6",
                    borderRadius: 3,
                    background: `rgba(0, 242, 79, ${0.6 * cel})`,
                    border: `1px solid ${misturar(COR.linha, COR.verde, cel * 0.8)}`,
                    scale: 0.55 + cel * 0.45,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </Cartao>
  );
}

/* ── o dado, respondendo "qual recurso o cliente mais procura?" ───────────── */

const RECURSOS = [
  { nome: "Câmera", valor: 2338 },
  { nome: "Tela", valor: 1638 },
  { nome: "Som", valor: 952 },
  { nome: "Vídeo", valor: 651 },
];
const MAIOR = RECURSOS[0].valor;

/** Movimento por hora. Forma, não medição: o eixo não tem número. */
const HORAS = [
  { h: "10", v: 0.16 }, { h: "11", v: 0.24 }, { h: "12", v: 0.33 },
  { h: "13", v: 0.42 }, { h: "14", v: 0.55 }, { h: "15", v: 0.64 },
  { h: "16", v: 0.66 }, { h: "17", v: 0.88 }, { h: "18", v: 1.0 },
  { h: "19", v: 0.88 }, { h: "20", v: 0.78 }, { h: "21", v: 0.67 },
];
const PICO = 8;

export function CartaoDados({
  moldura,
  conteudo,
  duracao,
  saidaEm,
  ancorado,
}: {
  moldura: number;
  conteudo: number;
  duracao: number;
  saidaEm?: number;
  ancorado?: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const HORA_ZERO = conteudo + 96;

  return (
    <Cartao
      titulo="Dados · últimos 7 dias"
      moldura={moldura}
      duracao={duracao}
      saidaEm={saidaEm}
      ancorado={ancorado}
      selo={<Selo>12 aparelhos · 4 lojas</Selo>}
    >
      <Rotulo>O que o visitante quis testar</Rotulo>
      <div style={{ display: "flex", flexDirection: "column", gap: 15, margin: "16px 0 30px" }}>
        {RECURSOS.map((r, i) => {
          /**
           * A vencedora entra POR ÚLTIMO e mais devagar.
           *
           * A pergunta na tela é "qual recurso o cliente mais procura?" e a
           * resposta é Câmera. Antes ela era a primeira, com a mesma curva e a
           * mesma duração de "Vídeo" — o motion tratava o argumento e o ruído
           * como iguais. Motion existe para dirigir o olho.
           */
          const vencedora = i === 0;
          const entra = vencedora ? conteudo + 46 : conteudo + (i - 1) * 12;
          const rampa = vencedora ? 40 : 26;
          const p = interpolate(frame, [entra, entra + rampa], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ENTRA,
          });
          /** O número continua correndo depois de a barra parar. */
          const conta = interpolate(frame, [entra, entra + rampa + 12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: CENA,
          });
          return (
            <div key={r.nome} style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <span
                style={{
                  fontSize: 21,
                  color: vencedora ? COR.texto : COR.fraco,
                  fontWeight: vencedora ? 600 : 400,
                  width: 110,
                  flexShrink: 0,
                }}
              >
                {r.nome}
              </span>
              <div
                style={{
                  flex: 1,
                  height: 15,
                  borderRadius: 999,
                  background: COR.superficie2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${(r.valor / MAIOR) * p * 100}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: COR.verde,
                    opacity: vencedora ? 1 : 0.72,
                    boxShadow: vencedora
                      ? `0 0 ${18 * Math.max(0, 1 - Math.abs((frame - (entra + rampa)) / 10))}px ${COR.verde}`
                      : undefined,
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: 21,
                  color: vencedora ? COR.texto : COR.fraco,
                  fontWeight: vencedora ? 600 : 400,
                  width: 90,
                  textAlign: "right",
                  flexShrink: 0,
                }}
              >
                {Math.round(r.valor * conta).toLocaleString("pt-BR")}
              </span>
            </div>
          );
        })}
      </div>

      <Rotulo>Movimento por hora</Rotulo>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 150, marginTop: 16 }}>
        {HORAS.map((x, i) => {
          /* O pico entra por último e com mola: o resto é fila, ele é acento. */
          const ehPico = i === PICO;
          const entra = ehPico
            ? HORA_ZERO + 46
            : HORA_ZERO + emCadeia(i, HORAS.length, 44);
          const p = ehPico
            ? spring({ frame: frame - entra, fps, config: { damping: 13, stiffness: 170, mass: 0.9 } })
            : interpolate(frame, [entra, entra + 20], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ENTRA,
              });
          return (
            <div
              key={x.h}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}
            >
              <div
                style={{
                  width: "100%",
                  height: x.v * 118 * Math.max(0, p),
                  borderRadius: 6,
                  background: COR.verde,
                  opacity: ehPico ? 1 : 0.4 + x.v * 0.4,
                }}
              />
              <span
                style={{
                  fontSize: 16,
                  color: ehPico
                    ? misturar(COR.fraco, COR.verde, Math.min(1, Math.max(0, p)))
                    : COR.fraco,
                  fontWeight: ehPico ? 600 : 400,
                }}
              >
                {x.h}h
              </span>
            </div>
          );
        })}
      </div>
    </Cartao>
  );
}

/* ── peças ────────────────────────────────────────────────────────────────── */

/** Interpola entre duas cores hexadecimais. Evita estados que ligam de uma vez. */
function misturar(de: string, para: string, t: number) {
  const n = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [r1, g1, b1] = n(de);
  const [r2, g2, b2] = n(para);
  const k = Math.min(1, Math.max(0, t));
  return `rgb(${Math.round(r1 + (r2 - r1) * k)}, ${Math.round(g1 + (g2 - g1) * k)}, ${Math.round(
    b1 + (b2 - b1) * k,
  )})`;
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 15,
        fontWeight: 600,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: COR.fraco,
      }}
    >
      {children}
    </span>
  );
}

/**
 * Um número grande do painel.
 *
 * `reserva` guarda a largura do MAIOR valor que o contador vai chegar a
 * mostrar. Sem isso, o contador subindo de 0 a 96 empurra o rótulo "aparelhos"
 * para a direita quando cruza de um para dois dígitos — no meio da contagem,
 * a palavra ao lado dá um pulo. Reservando o espaço, o dígito novo aparece
 * dentro da caixa e nada em volta se mexe.
 */
function Numero({ children, reserva }: { children: React.ReactNode; reserva: number }) {
  return (
    <span
      style={{
        fontSize: 48,
        fontWeight: 700,
        color: COR.texto,
        letterSpacing: "-0.03em",
        lineHeight: 1,
        display: "inline-block",
        minWidth: reserva,
      }}
    >
      {children}
    </span>
  );
}

function Colunas({ titulos }: { titulos: string[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "190px 130px 1fr 1fr 150px",
        padding: "0 10px 11px",
        borderBottom: `1px solid ${COR.linha}`,
      }}
    >
      {titulos.map((c) => (
        <span
          key={c}
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: COR.fraco,
          }}
        >
          {c}
        </span>
      ))}
    </div>
  );
}
