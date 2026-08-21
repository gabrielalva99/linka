import Link from "next/link";
import { getMessages } from "@/lib/i18n";
import { decimal } from "@/lib/numeros";

/**
 * O resumo do dia na tela inicial.
 *
 * POR QUE ISTO EXISTE. A tela inicial respondia uma pergunta só — "tem alarme?" —
 * e, quando não tinha, entregava uma frase e 90% de tela preta. É a tela mais
 * visitada do painel: o check da manhã, os trinta segundos antes de começar a
 * trabalhar.
 *
 * O BLOCO QUE MAIS IMPORTA é o primeiro: hoje contra ontem no mesmo horário. Ele
 * pega a falha que NENHUM alarme vê — tudo reportando, tudo verde, e ninguém
 * interagindo. Aparelho virado para a parede, dentro da gaveta, vitrine com vídeo
 * que não roda. O alarme de frota não enxerga porque o aparelho está saudável.
 *
 * "No mesmo horário" e não "o dia inteiro": comparar as 10h de hoje com as 24h de
 * ontem faria toda manhã parecer um desastre.
 *
 * TUDO AQUI VEM DO ROLLUP, nunca de device_events cru. Esta tela se recarrega
 * sozinha, então uma consulta caente aqui roda a cada minuto, por aba aberta. A
 * medição que motivou o rollup: a view antiga levava 49 ms com 1.345 eventos e
 * varre o histórico inteiro; o rollup responde em 0,2 ms e não piora com o tempo.
 */
export type ResumoDoDia = {
  hoje: { visitas: number; segundosVitrine: number };
  ontem: { visitas: number; segundosVitrine: number };
  horaCorte: string;
  campanha: { nomes: string[]; baixaram: number; total: number } | null;
  pendencias: {
    semLoja: number;
    videosOrfaos: number;
    pacotesSemClasse: number;
    comAppExtra: number;
  };
};

/** "3h12" / "44min" — hora cheia só quando existe. */
function tempo(segundos: number): string {
  if (segundos <= 0) return "—";
  const h = Math.floor(segundos / 3600);
  const m = Math.round((segundos % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}

/** Variação em pontos percentuais, só quando há base para comparar. */
function variacao(hoje: number, ontem: number): { texto: string; cor: string } | null {
  if (ontem <= 0) return null;
  const pct = ((hoje - ontem) / ontem) * 100;
  if (Math.abs(pct) < 1) return { texto: "igual a ontem", cor: "text-muted" };
  const sinal = pct > 0 ? "+" : "";
  return {
    texto: `${sinal}${decimal(pct, 0)}% que ontem`,
    cor: pct > 0 ? "text-success" : "text-warning",
  };
}

export function ResumoDoDia({
  resumo,
  ehOperadorDaPlataforma = false,
}: {
  resumo: ResumoDoDia;
  ehOperadorDaPlataforma?: boolean;
}) {
  const t = getMessages();
  const { hoje, ontem, horaCorte, campanha, pendencias } = resumo;
  const varVisitas = variacao(hoje.visitas, ontem.visitas);
  const varVitrine = variacao(hoje.segundosVitrine, ontem.segundosVitrine);

  const listaPendencias: { texto: string; href: string }[] = [];
  if (pendencias.semLoja > 0) {
    listaPendencias.push({
      texto: (pendencias.semLoja === 1 ? t.home.pendNoStore : t.home.pendNoStoreP).replace(
        "{n}",
        String(pendencias.semLoja),
      ),
      href: "/dispositivos?loja=sem",
    });
  }
  if (pendencias.videosOrfaos > 0) {
    listaPendencias.push({
      texto: (pendencias.videosOrfaos === 1
        ? t.home.pendOrphanMedia
        : t.home.pendOrphanMediaP
      ).replace("{n}", String(pendencias.videosOrfaos)),
      href: "/biblioteca",
    });
  }
  // Aplicativo que ninguem instalou de fabrica na vitrine.
  //
  // Vale para o cliente tambem, e nao so para a plataforma: quem resolve e quem
  // tem o aparelho na mao. Leva para a lista JA FILTRADA, porque saber que
  // existem tres nao ajuda se descobrir quais custa abrir a frota inteira.
  if (pendencias.comAppExtra > 0) {
    listaPendencias.push({
      texto: (pendencias.comAppExtra === 1
        ? t.home.pendExtraApps
        : t.home.pendExtraAppsP
      ).replace("{n}", String(pendencias.comAppExtra)),
      href: "/dispositivos?situacao=app_extra",
    });
  }
  // SÓ PARA QUEM PODE RESOLVER.
  //
  // Classificar aplicativo é do operador da plataforma — o catálogo é global e
  // vale para todas as marcas. Mostrar a pendência para o cliente era mandá-lo a
  // uma tela onde ele lê nomes de pacote Android e não tem botão nenhum. Aviso
  // sem caminho é o que ensina a equipe a ignorar o bloco inteiro, que é
  // exatamente o que este bloco existe para evitar.
  if (ehOperadorDaPlataforma && pendencias.pacotesSemClasse > 0) {
    listaPendencias.push({
      texto: (pendencias.pacotesSemClasse === 1
        ? t.home.pendUnclassified
        : t.home.pendUnclassifiedP
      ).replace("{n}", String(pendencias.pacotesSemClasse)),
      // Leva para onde SE RESOLVE, não para onde o efeito aparece. Apontava para
      // o relatório, que só mostra o número contaminado — quem clicava não tinha
      // o que fazer ali, e um aviso sem saída ensina a ignorar o bloco todo.
      href: "/dispositivos/aplicativos",
    });
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {/* 1. A operação está produzindo? */}
      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">{t.home.producing}</h2>
          <span className="text-xs text-muted">
            {t.home.today.replace("{hora}", horaCorte)}
          </span>
        </div>

        {/* UMA variação por número, e não uma solta ao lado dos dois.
            Na primeira versão desta tela o rótulo "+175% que ontem" ficava depois
            dos dois valores — e descrevia só as visitas. Naquele mesmo momento a
            vitrine tinha CAÍDO de 25h55 para 16h20. Quem lesse concluiria que tudo
            melhorou. Número que engana é pior que número ausente, e aqui o engano
            era meu. */}
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-2xl font-semibold">
              {hoje.visitas}
              <span className="ml-1.5 text-sm font-normal text-muted">
                {t.home.visits}
              </span>
            </p>
            {varVisitas ? (
              <p className={`mt-0.5 text-xs ${varVisitas.cor}`}>
                {varVisitas.texto}
                <span className="text-muted">
                  {" · "}
                  {t.home.yesterday.toLowerCase()}: {ontem.visitas}
                </span>
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-muted">{t.home.noBaseline}</p>
            )}
          </div>

          <div>
            <p className="text-2xl font-semibold">
              {tempo(hoje.segundosVitrine)}
              <span className="ml-1.5 text-sm font-normal text-muted">
                {t.home.showcaseTime}
              </span>
            </p>
            {varVitrine ? (
              <p className={`mt-0.5 text-xs ${varVitrine.cor}`}>
                {varVitrine.texto}
                <span className="text-muted">
                  {" · "}
                  {t.home.yesterday.toLowerCase()}: {tempo(ontem.segundosVitrine)}
                </span>
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-muted">{t.home.noBaseline}</p>
            )}
          </div>
        </div>

        <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
          {t.home.producingHint}
        </p>
      </section>

      {/* 2. O que está no ar — a publicação chegou nas lojas? */}
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-medium">{t.home.onAir}</h2>
        {campanha ? (
          <p className="mt-2 text-sm">
            {campanha.nomes.map((nome, i) => (
              <span key={nome}>
                {i > 0 && <span className="text-muted">{" · "}</span>}
                <Link
                  href="/campanhas"
                  className="font-medium hover:text-primary hover:underline"
                >
                  {nome}
                </Link>
              </span>
            ))}
            <span className="text-muted">
              {" · "}
              {t.home.onAirDownloaded
                .replace("{n}", String(campanha.baixaram))
                .replace("{t}", String(campanha.total))}
            </span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">{t.home.onAirNone}</p>
        )}
      </section>

      {/* 3. Pendências que não apitam hoje e cobram depois. */}
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-medium">{t.home.pending}</h2>
        {listaPendencias.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t.home.pendingNone}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {listaPendencias.map((p) => (
              <li key={p.href + p.texto}>
                <Link href={p.href} className="text-sm text-muted hover:text-primary hover:underline">
                  {p.texto}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
