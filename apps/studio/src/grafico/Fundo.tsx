import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";
import { COR } from "../marca";
import { CENA, emCadeia, ENTRA } from "../curvas";
import { CENTRO, ELOS, HUBS, POSICAO_NA_FILA } from "./rede";

/**
 * O fundo da versão gráfica: a rede da LINKA, viva, do primeiro ao último
 * quadro.
 *
 * ── A decisão de arquitetura que faz a peça ser fluida ────────────────────
 * Este componente NÃO vive dentro de nenhuma cena. Ele fica na raiz da
 * composição e nunca é desmontado. Na versão com imagem de loja cada cena
 * carregava o próprio fundo, então toda troca de cena era um corte — e a
 * cortina da pergunta existia, em boa parte, para escondê-lo.
 *
 * Aqui não há corte nenhum em 54 segundos. O que muda entre as cenas é o
 * ESTADO de um fundo só: para onde a câmera olha, quanta luz há, o que está
 * aceso. Cena não troca de imagem, troca de ponto de vista. É isso que
 * elimina o "um sobrepõe o outro".
 *
 * ── Nunca congela ─────────────────────────────────────────────────────────
 * Tudo aqui tem movimento próprio e contínuo: os nós respiram fora de fase,
 * os pulsos correm pelos elos, as partículas sobem, a trama deriva, o brilho
 * passeia. Não existe um quadro igual ao anterior nem quando a peça está
 * "parada" — que é exatamente o buraco em que a versão anterior caiu, com
 * 152 quadros idênticos no cartão de texto.
 *
 * ── As camadas, do fundo para a frente ────────────────────────────────────
 *   1. brilho radial — passeia devagar, dá volume ao preto
 *   2. trama de pontos — parallax 0,5×, textura sem ruído
 *   3. a REDE — parallax 1×, é o conteúdo
 *   4. partículas — parallax 1,5×, desfocadas, dão profundidade de campo
 *   5. varredura e vinheta — assentam as bordas
 *
 * O parallax só vale para camadas independentes. A rede inteira anda numa
 * banda só de propósito: separar os nós por profundidade quebraria os elos,
 * porque as duas pontas de uma linha andariam em velocidades diferentes.
 */

export type ChaveDeCamera = {
  /** Quadro da COMPOSIÇÃO (a câmera é contínua, não conhece cenas). */
  f: number;
  escala: number;
  x: number;
  y: number;
};

type Janela = readonly [number, number];

export function Fundo({
  camera,
  luz,
  formacao,
  onda,
  falhas,
  convergencia,
}: {
  camera: ChaveDeCamera[];
  /** Keyframes de luminosidade geral: [quadro, 0..1]. */
  luz: Janela[];
  /** Quantos quadros a rede leva para se formar, do quadro 0. */
  formacao: number;
  /** Janela da onda de publicação: [parte, apaga]. */
  onda: Janela;
  /** Janela em que os aparelhos apagados ficam vermelhos. */
  falhas: Janela;
  /** Janela do colapso final da rede para dentro da marca. */
  convergencia: Janela;
}) {
  const frame = useCurrentFrame();

  /* ── câmera ──────────────────────────────────────────────────────────── */
  const quadros = camera.map((k) => k.f);
  const opcoes = {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: CENA,
  } as const;
  const escala = interpolate(frame, quadros, camera.map((k) => k.escala), opcoes);
  /* A deriva de baixa frequência é o que impede a câmera de ficar cravada
     entre dois keyframes. Períodos primos entre si para nunca reciclar. */
  const panX = interpolate(frame, quadros, camera.map((k) => k.x), opcoes) + Math.sin(frame / 197) * 13;
  const panY = interpolate(frame, quadros, camera.map((k) => k.y), opcoes) + Math.cos(frame / 233) * 9;

  const brilho = interpolate(
    frame,
    luz.map((l) => l[0]),
    luz.map((l) => l[1]),
    opcoes,
  );

  /* ── colapso final: contração uniforme em torno do centro ────────────── */
  const colapso = interpolate(frame, convergencia, [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: CENA,
  });
  const contracao = 1 - colapso * 0.82;

  /* ── onda de publicação ──────────────────────────────────────────────── */
  const ondaT = interpolate(frame, [onda[0], onda[0] + 78], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: CENA,
  });
  const raioDaOnda = ondaT * 1780;
  const ondaViva = interpolate(frame, [onda[1] - 44, onda[1]], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: CENA,
  });

  /* ── falhas ──────────────────────────────────────────────────────────── */
  const falhaT = interpolate(
    frame,
    [falhas[0], falhas[0] + 22, falhas[1] - 26, falhas[1]],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: CENA },
  );

  const camadaDaRede = `translate(${CENTRO.x}px, ${CENTRO.y}px) scale(${escala * contracao}) translate(${-CENTRO.x}px, ${-CENTRO.y}px) translate(${panX}px, ${panY}px)`;
  const camadaDoFundo = `translate(${CENTRO.x}px, ${CENTRO.y}px) scale(${1 + (escala - 1) * 0.55}) translate(${-CENTRO.x}px, ${-CENTRO.y}px) translate(${panX * 0.5}px, ${panY * 0.5}px)`;
  const camadaDaFrente = `translate(${CENTRO.x}px, ${CENTRO.y}px) scale(${1 + (escala - 1) * 1.5}) translate(${-CENTRO.x}px, ${-CENTRO.y}px) translate(${panX * 1.5}px, ${panY * 1.5}px)`;

  return (
    <AbsoluteFill style={{ background: COR.fundo, overflow: "hidden" }}>
      <BrilhoDeFundo intensidade={brilho} />

      {/* trama de pontos — textura, bem atrás */}
      <AbsoluteFill style={{ transform: camadaDoFundo, opacity: 0.5 + brilho * 0.5 }}>
        <Trama />
      </AbsoluteFill>

      {/* a rede */}
      <AbsoluteFill style={{ transform: camadaDaRede, opacity: brilho }}>
        <svg
          width={1920}
          height={1080}
          viewBox="0 0 1920 1080"
          style={{ position: "absolute", inset: 0, overflow: "visible" }}
        >
          <Elos formacao={formacao} raioDaOnda={raioDaOnda} ondaViva={ondaViva} />
          <AnelDaOnda raio={raioDaOnda} t={ondaT} vivo={ondaViva} />
          <Nos
            formacao={formacao}
            raioDaOnda={raioDaOnda}
            ondaViva={ondaViva}
            falhaT={falhaT}
          />
        </svg>
      </AbsoluteFill>

      {/* partículas — profundidade de campo */}
      <AbsoluteFill style={{ transform: camadaDaFrente, opacity: brilho * 0.9 }}>
        <Particulas />
      </AbsoluteFill>

      <Varredura />
      {/* Vinheta: assenta as bordas e manda o olho para o centro, onde o
          cartão está. Sem ela a rede compete com a interface. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(128% 96% at 50% 48%, transparent 34%, ${COR.fundo}dd 82%, ${COR.fundo} 100%)`,
        }}
      />
    </AbsoluteFill>
  );
}

/* ── os elos ──────────────────────────────────────────────────────────────── */

/**
 * Cada elo é desenhado por um traço que corre — e depois carrega um pulso.
 *
 * O pulso é feito com `strokeDasharray`, não com um círculo andando por cima:
 * a luz fica presa DENTRO da linha, com a mesma espessura e o mesmo arredondamento
 * da ponta. Um círculo por cima lê como partícula solta; o traço lê como sinal.
 */
function Elos({
  formacao,
  raioDaOnda,
  ondaViva,
}: {
  formacao: number;
  raioDaOnda: number;
  ondaViva: number;
}) {
  const frame = useCurrentFrame();

  return (
    <g>
      {ELOS.map((elo, i) => {
        const a = HUBS[elo.de];
        const b = HUBS[elo.para];

        /* O elo nasce depois das DUAS pontas — uma linha ligando um nó que
           ainda não existe é o erro clássico de rede animada. */
        const nasce =
          Math.max(entradaDoHub(elo.de, formacao), entradaDoHub(elo.para, formacao)) +
          RAMPA_DO_HUB * 0.5;
        const traco = interpolate(frame, [nasce, nasce + 30], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ENTRA,
        });
        if (traco <= 0) return null;

        /* O pulso só entra depois de o traço estar quase inteiro — luz correndo
           por uma linha que ainda está sendo desenhada não faz sentido. */
        const vivoT = interpolate(traco, [0.82, 1], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        /* A onda de publicação acende o elo inteiro quando passa por ele. */
        const meioX = (a.x + b.x) / 2;
        const meioY = (a.y + b.y) / 2;
        const dist = Math.hypot(meioX - CENTRO.x, meioY - CENTRO.y);
        const aceso =
          interpolate(raioDaOnda - dist, [0, 150], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }) * ondaViva;

        const t = (frame * elo.velocidade + elo.fase) % 1;
        const cabeca = 34;
        const rastro = 130;

        return (
          <g key={i}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={COR.verde}
              strokeWidth={1.15 + aceso * 0.9}
              strokeLinecap="round"
              opacity={(0.1 + aceso * 0.3) * traco}
              strokeDasharray={`${elo.comprimento * traco} ${elo.comprimento}`}
            />
            {/* rastro: a memória do sinal que acabou de passar */}
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={COR.verde}
              strokeWidth={1.6}
              strokeLinecap="round"
              opacity={0.16 * vivoT}
              strokeDasharray={`${rastro} ${elo.comprimento + rastro}`}
              strokeDashoffset={rastro - t * (elo.comprimento + rastro)}
            />
            {/* cabeça: o ponto mais claro, à frente do rastro */}
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={COR.verdeClaro}
              strokeWidth={2.1}
              strokeLinecap="round"
              opacity={(0.5 + aceso * 0.5) * vivoT}
              strokeDasharray={`${cabeca} ${elo.comprimento + cabeca}`}
              strokeDashoffset={cabeca - t * (elo.comprimento + cabeca)}
            />
          </g>
        );
      })}
    </g>
  );
}

/* ── os nós ───────────────────────────────────────────────────────────────── */

/** Quanto da janela de formação é usado pela fila de hubs (o resto é rampa). */
const FATIA_DA_FILA = 0.66;
const RAMPA_DO_HUB = 26;

/**
 * Quando o hub `i` entra, na formação inicial.
 *
 * A fila é por DISTÂNCIA DO CENTRO (`POSICAO_NA_FILA`), não pela ordem do
 * array — a rede cresce de dentro para fora. Em cadeia, não em metrônomo:
 * começa esparso e comprime no fim, então o grupo "pousa" em vez de desfilar.
 */
function entradaDoHub(i: number, formacao: number) {
  return emCadeia(POSICAO_NA_FILA[i], HUBS.length, formacao * FATIA_DA_FILA, 1.25);
}

function Nos({
  formacao,
  raioDaOnda,
  ondaViva,
  falhaT,
}: {
  formacao: number;
  raioDaOnda: number;
  ondaViva: number;
  falhaT: number;
}) {
  const frame = useCurrentFrame();

  return (
    <g>
      {HUBS.map((hub) => {
        const nasce = entradaDoHub(hub.id, formacao);
        const p = interpolate(frame, [nasce, nasce + RAMPA_DO_HUB], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ENTRA,
        });
        if (p <= 0) return null;

        /* Respiração: período longo e fase própria. Se todos respirarem
           juntos a tela inteira pisca, e piscar é o que denuncia gerado. */
        const respira = 1 + Math.sin(frame / 62 + hub.fase) * 0.085;

        const dist = Math.hypot(hub.x - CENTRO.x, hub.y - CENTRO.y);
        const aceso =
          interpolate(raioDaOnda - dist, [0, 130], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }) * ondaViva;
        /* O estalo no instante exato em que o anel cruza o nó. */
        const estala =
          Math.max(0, 1 - Math.abs(dist - raioDaOnda) / 190) * ondaViva;

        const raioBase = 4.2 + hub.z * 3.4;
        const raio = raioBase * respira * (0.35 + p * 0.65) * (1 + estala * 0.5);
        const luz = (0.34 + hub.z * 0.3 + aceso * 0.5) * p;

        return (
          <g key={hub.id}>
            {/* halo — o que dá a impressão de emissão, e não de bolinha */}
            <circle
              cx={hub.x}
              cy={hub.y}
              r={raio * (5.2 + estala * 4)}
              fill={COR.verde}
              opacity={(0.05 + aceso * 0.09 + estala * 0.1) * p}
            />
            <circle cx={hub.x} cy={hub.y} r={raio} fill={COR.verde} opacity={Math.min(1, luz)} />
            <circle
              cx={hub.x}
              cy={hub.y}
              r={raio * 0.42}
              fill={COR.verdeClaro}
              opacity={Math.min(1, luz * 1.2)}
            />

            {hub.satelites.map((s, k) => {
              /* Órbita lenta: o satélite passeia em torno do hub. É o que
                 separa "constelação viva" de "diagrama com brilho". */
              const orbita = frame / (760 + hub.z * 260) + s.fase;
              const ox = s.dx * Math.cos(orbita) - s.dy * Math.sin(orbita);
              const oy = (s.dx * Math.sin(orbita) + s.dy * Math.cos(orbita)) * 0.62;
              const x = hub.x + ox;
              const y = hub.y + oy;

              const entra = interpolate(frame, [nasce + 8 + k * 4, nasce + 34 + k * 4], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ENTRA,
              });
              const cintila = 0.55 + Math.sin(frame / 34 + s.fase * 3) * 0.22;
              const cor = s.falha ? COR.alerta : COR.verdeClaro;
              const forcaDaFalha = s.falha ? falhaT : 0;

              return (
                <g key={k}>
                  <line
                    x1={hub.x}
                    y1={hub.y}
                    x2={x}
                    y2={y}
                    stroke={cor}
                    strokeWidth={0.9}
                    opacity={(0.1 + forcaDaFalha * 0.22) * entra}
                  />
                  {forcaDaFalha > 0 && (
                    <circle
                      cx={x}
                      cy={y}
                      r={s.raio * 7 * forcaDaFalha}
                      fill={COR.alerta}
                      opacity={0.14 * forcaDaFalha * entra}
                    />
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={s.raio * (0.4 + entra * 0.6) * (1 + forcaDaFalha * 0.4)}
                    fill={cor}
                    opacity={(0.2 + cintila * 0.42 + aceso * 0.3 + forcaDaFalha * 0.35) * entra}
                  />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/* ── a onda de publicação ─────────────────────────────────────────────────── */

/**
 * O anel que sai do centro do quadro — de dentro do painel — e atravessa a
 * rede quando o botão "Publicar" é apertado.
 *
 * Não é enfeite de transição: é a única parte da peça em que o fundo responde
 * ao que a interface acabou de fazer. Ele parte do painel, chega nas lojas, e
 * as lojas acendem na ordem da distância.
 */
function AnelDaOnda({ raio, t, vivo }: { raio: number; t: number; vivo: number }) {
  if (t <= 0 || t >= 1 || vivo <= 0) return null;
  const desbota = Math.pow(1 - t, 1.7);
  return (
    <g opacity={vivo}>
      <circle
        cx={CENTRO.x}
        cy={CENTRO.y}
        r={raio}
        fill="none"
        stroke={COR.verdeClaro}
        strokeWidth={2.4}
        opacity={desbota * 0.5}
      />
      <circle
        cx={CENTRO.x}
        cy={CENTRO.y}
        r={raio * 0.93}
        fill="none"
        stroke={COR.verde}
        strokeWidth={9}
        opacity={desbota * 0.12}
      />
    </g>
  );
}

/* ── camadas de atmosfera ─────────────────────────────────────────────────── */

/**
 * O brilho de fundo. Dois focos verdes moles, em períodos diferentes, bem
 * abaixo do limiar de "gradiente animado de landing page".
 *
 * Existe para o preto ter volume. Preto chapado atrás de uma interface branca
 * é o visual de captura de tela, não de peça.
 */
function BrilhoDeFundo({ intensidade }: { intensidade: number }) {
  const frame = useCurrentFrame();
  /* Períodos e amplitudes deliberadamente maiores do que a primeira tentativa.
     Durante as perguntas a rede fica desfocada, e desfoque mata justamente o
     movimento de alta frequência (linhas finas, pontos). O que sobrevive ao
     desfoque é luminância de área grande — que é isto aqui. Sem isso, a pausa
     de leitura era o trecho mais parado da peça. */
  const ax = 50 + Math.sin(frame / 172) * 22;
  const ay = 42 + Math.cos(frame / 205) * 16;
  const bx = 50 + Math.cos(frame / 139) * 27;
  const by = 62 + Math.sin(frame / 163) * 18;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(58% 62% at ${ax}% ${ay}%, ${COR.verde}1c 0%, transparent 66%), radial-gradient(46% 52% at ${bx}% ${by}%, ${COR.verde}12 0%, transparent 70%)`,
        opacity: intensidade,
      }}
    />
  );
}

/** Trama de pontos. Deriva num percurso longo para nunca voltar ao mesmo lugar. */
function Trama() {
  const frame = useCurrentFrame();
  const dx = (frame * 0.16) % 54;
  const dy = (frame * 0.09) % 54;
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <pattern
          id="trama-linka"
          width={54}
          height={54}
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${dx} ${dy})`}
        >
          <circle cx={1.4} cy={1.4} r={1.1} fill={COR.verde} />
        </pattern>
      </defs>
      <rect x={-120} y={-120} width={2160} height={1320} fill="url(#trama-linka)" opacity={0.06} />
    </svg>
  );
}

/** Partículas subindo devagar, desfocadas. Camada mais próxima da lente. */
const PARTICULAS = Array.from({ length: 26 }, (_, i) => ({
  x: random(`px-${i}`) * 2040 - 60,
  y0: random(`py-${i}`) * 1240,
  raio: 1.2 + random(`pr-${i}`) * 2.6,
  velocidade: 0.16 + random(`pv-${i}`) * 0.34,
  balanco: random(`pb-${i}`) * Math.PI * 2,
}));

function Particulas() {
  const frame = useCurrentFrame();
  return (
    <svg
      width={1920}
      height={1080}
      style={{ position: "absolute", inset: 0, filter: "blur(1.6px)" }}
    >
      {PARTICULAS.map((p, i) => {
        /* O ciclo é maior que a tela e a opacidade zera nas duas pontas, para
           o reinício da volta nunca aparecer como um ponto que some. */
        const ciclo = (p.y0 + 1240 - ((frame * p.velocidade) % 1240)) % 1240;
        const y = ciclo - 80;
        const borda = Math.min(1, Math.min(ciclo, 1240 - ciclo) / 150);
        return (
          <circle
            key={i}
            cx={p.x + Math.sin(frame / 120 + p.balanco) * 26}
            cy={y}
            r={p.raio}
            fill={COR.verdeClaro}
            opacity={0.16 * borda}
          />
        );
      })}
    </svg>
  );
}

/**
 * Varredura: uma faixa de luz muito fraca que desce a tela a cada ~14 s.
 *
 * É de propósito quase invisível (4%). Serve para o fundo nunca ter um trecho
 * longo sem nada acontecendo em escala grande — o olho registra a passagem
 * mesmo sem conseguir apontar o que passou.
 */
function Varredura() {
  const frame = useCurrentFrame();
  const t = ((frame % 350) / 350) * 1.6 - 0.3;
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, transparent ${(t - 0.16) * 100}%, ${COR.verde}0a ${t * 100}%, transparent ${(t + 0.16) * 100}%)`,
        opacity: 0.85,
      }}
    />
  );
}
