import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import { getSessionContext } from "@/lib/auth";
import { porCliente, tenantFilter } from "@/lib/tenant";
import { AutoRefresh } from "./auto-refresh";
import { ResumoDoDia, type ResumoDoDia as TipoResumo } from "./resumo-do-dia";
import { FUSO_PADRAO, hora } from "@/lib/datas";

type Issue = {
  device_id: string;
  code: string | null;
  name: string;
  loja: string | null;
  tipo: string;
  gravidade: string;
  detalhe: string;
  aberta: boolean;
  exclude_from_reports: boolean;
  store_id: string | null;
};

/**
 * A primeira tela responde uma pergunta só: o que está errado agora.
 *
 * Antes ela mostrava o papel do usuário e a lista de clientes, coisas que
 * ninguém precisa saber duas vezes. Com 250 aparelhos em 15 lojas, ninguém vai
 * abrir aparelho por aparelho para descobrir que a vitrine de uma loja apagou.
 *
 * Agrupa por LOJA porque é assim que a operação age: quem resolve vai até uma
 * loja, não até um aparelho.
 */
export default async function DashboardPage() {
  const ctx = await getSessionContext();
  const t = getMessages();
  const supabase = await createSupabaseServerClient();

  const filtro = await tenantFilter();

  // Janela de hoje e de ontem ATÉ A MESMA HORA. Comparar as 10h de hoje com as
  // 24h de ontem faria toda manhã parecer um desastre.
  const agora = new Date();
  const hojeSP = new Date(
    agora.toLocaleString("en-US", { timeZone: FUSO_PADRAO }),
  );
  const horaCorte = hora(agora);
  const diaHoje = `${hojeSP.getFullYear()}-${String(hojeSP.getMonth() + 1).padStart(2, "0")}-${String(hojeSP.getDate()).padStart(2, "0")}`;
  const ontemData = new Date(hojeSP);
  ontemData.setDate(ontemData.getDate() - 1);
  const diaOntem = `${ontemData.getFullYear()}-${String(ontemData.getMonth() + 1).padStart(2, "0")}-${String(ontemData.getDate()).padStart(2, "0")}`;
  const horaLimite = hojeSP.getHours() + 1; // inclui a hora corrente

  const [
    { data: issuesData, error: issuesError },
    { count: totalDevices },
    { data: rollupHoje },
    { data: rollupOntem },
    { data: campanhaAtiva },
    { count: semLoja },
    { count: sincronizados },
    { data: pacotesSemClasse },
    { data: videosDoCliente },
    { data: videosEmCampanha },
  ] =
    await Promise.all([
      porCliente(
        supabase
          .from("v_device_issues")
          .select(
            "device_id, code, name, loja, store_id, tipo, gravidade, detalhe, aberta, exclude_from_reports",
          ),
        filtro,
      ),
      // Só os aparelhos EM OPERAÇÃO.
      //
      // Sem este filtro a tela dizia "os 6 aparelhos estão reportando" com dois
      // na mesa e quatro arquivados. A lista da frota já escondia os arquivados,
      // então as duas telas discordavam entre si — e a que exagerava era
      // justamente a que a pessoa abre primeiro.
      porCliente(
        supabase
          .from("devices")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true),
        filtro,
      ),
      // Produção de hoje e de ontem — DO ROLLUP, nunca de device_events cru.
      // Esta tela se recarrega sozinha; consulta caente aqui roda a cada minuto
      // por aba aberta. A view antiga levava 49 ms e varria o histórico inteiro.
      porCliente(
        supabase
          .from("rollup_visita_hora")
          .select("visitas, segundos_vitrine")
          .gte("hora_local", `${diaHoje}T00:00:00`)
          .lt("hora_local", `${diaHoje}T${String(horaLimite).padStart(2, "0")}:00:00`),
        filtro,
      ),
      porCliente(
        supabase
          .from("rollup_visita_hora")
          .select("visitas, segundos_vitrine")
          .gte("hora_local", `${diaOntem}T00:00:00`)
          .lt("hora_local", `${diaOntem}T${String(horaLimite).padStart(2, "0")}:00:00`),
        filtro,
      ),
      // A publicação chegou? Campanha ativa + quantos aparelhos já baixaram tudo.
      porCliente(
        // TODAS as campanhas no ar, e em ordem definida.
        //
        // Era `.limit(1)` sem `order by`: com duas campanhas ativas — e a
        // Motorola tem duas — a tela mostrava UMA, escolhida pelo acaso do
        // banco, e podia trocar entre dois carregamentos. Quem lia concluía que
        // a outra não estava no ar. "O que está no ar" é a pergunta que esta
        // tela responde; responder pela metade é pior que não responder.
        supabase
          .from("campaigns")
          .select("name")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(5),
        filtro,
      ),
      porCliente(
        supabase
          .from("devices")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .is("store_id", null),
        filtro,
      ),
      porCliente(
        supabase
          .from("devices")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .eq("synced", true),
        filtro,
      ),
      // Pacote medido e não classificado: o P0 que a varredura de UX abriu. Vive
      // aqui porque é pendência que não apita e cobra depois — o número de
      // "recurso mais usado" fica errado sem ninguém perceber.
      supabase.rpc("pacotes_sem_classificacao"),
      // SÓ PEÇAS PRINCIPAIS entram nesta conta.
      //
      // Variante nunca está em `campaign_items`, e isso é o desenho, não uma
      // falta: a campanha aponta para a peça principal e o servidor troca pelo
      // formato de cada aparelho. Sem este filtro, subir um pack de catorze
      // formatos fazia a tela inicial anunciar "13 vídeos fora de campanha" —
      // treze avisos que ninguém pode resolver, logo na tela cujo trabalho é
      // mostrar o que precisa de ação. Alerta que não fecha ensina a equipe a
      // ignorar a tela inteira.
      porCliente(supabase.from("media_assets").select("id").is("variant_of", null), filtro),
      porCliente(supabase.from("campaign_items").select("media_id"), filtro),
    ]);

  // Falha de leitura NÃO pode virar "tudo certo". Esta tela existe para avisar
  // que algo caiu; se ela mesma cair em silêncio, mente exatamente na hora em
  // que mais importa: sessão expirada, banco fora do ar e frota saudável
  // produziam a mesma tela verde.
  if (issuesError) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="text-xl font-semibold">
          {t.dashboard.welcome}
          {ctx?.fullName ? `, ${ctx.fullName}` : ""}
        </h1>
        <div className="mt-6 rounded-xl border border-warning/40 bg-warning/10 p-6">
          <p className="text-lg font-semibold text-warning">{t.home.readFailed}</p>
          <p className="mt-1 text-sm text-muted">{t.home.readFailedHint}</p>
        </div>
        <AutoRefresh ms={30000} />
      </div>
    );
  }

  const issues = (issuesData ?? []) as Issue[];

  const somar = (
    linhas: { visitas: number | null; segundos_vitrine: number | null }[] | null,
  ) =>
    (linhas ?? []).reduce(
      (acc, l) => ({
        visitas: acc.visitas + (l.visitas ?? 0),
        segundosVitrine: acc.segundosVitrine + Number(l.segundos_vitrine ?? 0),
      }),
      { visitas: 0, segundosVitrine: 0 },
    );

  // Vídeo que não está em nenhuma campanha: comparação de conjuntos, não consulta
  // extra. É pendência de organização, não alarme.
  const usados = new Set(
    ((videosEmCampanha ?? []) as { media_id: string }[]).map((c) => c.media_id),
  );
  const videosOrfaos = ((videosDoCliente ?? []) as { id: string }[]).filter(
    (v) => !usados.has(v.id),
  ).length;

  const nomesDasCampanhas =
    ((campanhaAtiva ?? []) as { name: string }[]).map((c) => c.name);

  const resumo: TipoResumo = {
    hoje: somar(rollupHoje as never),
    ontem: somar(rollupOntem as never),
    horaCorte,
    campanha: nomesDasCampanhas.length > 0
      ? {
          nomes: nomesDasCampanhas,
          baixaram: sincronizados ?? 0,
          total: totalDevices ?? 0,
        }
      : null,
    pendencias: {
      semLoja: semLoja ?? 0,
      videosOrfaos,
      pacotesSemClasse: Number(pacotesSemClasse ?? 0),
    },
  };
  const criticos = issues.filter((i) => i.gravidade === "critico");
  const atencao = issues.filter((i) => i.gravidade !== "critico");
  const aparelhosComProblema = new Set(issues.map((i) => i.device_id)).size;
  const total = totalDevices ?? 0;

  // Por loja, com os críticos primeiro: é a ordem em que alguém vai agir.
  // Agrupa por id da loja, não pelo nome: duas lojas homônimas de redes
  // diferentes colapsariam no mesmo bloco e a pessoa iria ao endereço errado.
  //
  // E dentro da loja, POR APARELHO. A view devolve um aviso por sintoma, então um
  // aparelho desligado e sem loja rendia três linhas repetindo o mesmo nome — a
  // tela dava a impressão de três problemas onde havia um aparelho. Quem lê conta
  // aparelhos para saber o tamanho do estrago, não sintomas.
  //
  // O Map preserva a ordem de inserção e a lista já chega com os críticos na
  // frente: o aparelho aparece na posição do seu pior aviso, de graça.
  type AparelhoComProblema = {
    deviceId: string;
    code: string | null;
    name: string;
    ehTeste: boolean;
    itens: Issue[];
  };
  const porLoja = new Map<
    string,
    { nome: string; lojaId: string | null; aparelhos: Map<string, AparelhoComProblema> }
  >();
  for (const i of [...criticos, ...atencao]) {
    const chave = i.store_id ?? "sem-loja";
    let grupo = porLoja.get(chave);
    if (!grupo) {
      grupo = { nome: i.loja ?? t.home.noStore, lojaId: i.store_id, aparelhos: new Map() };
      porLoja.set(chave, grupo);
    }
    const aparelho = grupo.aparelhos.get(i.device_id);
    if (aparelho) {
      aparelho.itens.push(i);
    } else {
      grupo.aparelhos.set(i.device_id, {
        deviceId: i.device_id,
        code: i.code,
        name: i.name,
        ehTeste: i.exclude_from_reports,
        itens: [i],
      });
    }
  }

  const rotulo: Record<string, string> = {
    fora_do_ar: t.home.offline,
    tela_vazia: t.home.blankScreen,
    sem_travas: t.home.unlocked,
    // Não é problema: é alguém trabalhando no aparelho agora. Aparece na lista
    // para a operação não estranhar as proteções abertas — e para o "sem travas"
    // poder calar a boca sem esconder nada.
    em_manutencao: t.home.inMaintenance,
    // Irmão de "tela sem vídeo": lá a vitrine está vazia, aqui está coberta pelo
    // menu de testes. Para a loja significam a mesma coisa — a campanha não está
    // na tela — e o aparelho segue verde em tudo o mais.
    menu_parado: t.home.stuckInMenu,
    // Aparelho impecável em tudo, e guardando foto de cliente. O defeito não
    // aparece em nenhum indicador: só no texto da última faxina, na ficha.
    faxina_sem_permissao: t.home.cleanupBlocked,
    senha_de_tela: t.home.screenLock,
    atualizacao_travada: t.home.updateStuck,
    bateria_baixa: t.home.lowBattery,
    quente: t.home.hot,
    sem_loja: t.home.noStoreSet,
    // Sem modelo o aparelho some dos relatórios por modelo E da cobertura por
    // linha — a marca deixa de ver que a linha dela está instalada na loja.
    sem_modelo: t.home.noModelSet,
  };

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold">
        {t.dashboard.welcome}
        {ctx?.fullName ? `, ${ctx.fullName}` : ""}
      </h1>

      {issues.length === 0 ? (
        <div className="mt-6 rounded-xl border border-success/40 bg-success/5 p-6">
          <p className="text-lg font-semibold text-success">{t.home.allWell}</p>
          {/* Antes esta frase afirmava TRÊS coisas de uma vez — "reportando, com
              vídeo na tela e travados" — sem checar as três. Agora diz só o que a
              consulta realmente sabe: não há aviso aberto. */}
          <p className="mt-1 text-sm text-muted">
            {t.home.allWellDetail.replace("{n}", String(total))}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <section className="rounded-xl border border-line bg-surface p-5">
              <h2 className="text-sm font-medium text-muted">{t.home.critical}</h2>
              <p
                className={`mt-1 text-2xl font-semibold ${
                  criticos.length > 0 ? "text-warning" : ""
                }`}
              >
                {criticos.length}
              </p>
            </section>
            <section className="rounded-xl border border-line bg-surface p-5">
              <h2 className="text-sm font-medium text-muted">{t.home.attention}</h2>
              <p className="mt-1 text-2xl font-semibold">{atencao.length}</p>
            </section>
            <section className="rounded-xl border border-line bg-surface p-5">
              <h2 className="text-sm font-medium text-muted">{t.home.devicesAffected}</h2>
              <p className="mt-1 text-2xl font-semibold">
                {aparelhosComProblema}
                <span className="text-base font-normal text-muted"> / {total}</span>
              </p>
            </section>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            {[...porLoja.entries()].map(([chave, grupo]) => (
              <section key={chave} className="rounded-xl border border-line bg-surface p-5">
                <h2 className="text-sm font-medium">
                  {grupo.lojaId ? (
                    <Link
                      href={`/lojas/${grupo.lojaId}`}
                      className="hover:text-primary hover:underline"
                    >
                      {grupo.nome}
                    </Link>
                  ) : (
                    grupo.nome
                  )}
                </h2>
                <ul className="mt-3 flex flex-col gap-3">
                  {[...grupo.aparelhos.values()].map((ap) => (
                    <li
                      key={ap.deviceId}
                      className="border-b border-line pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <Link
                          href={`/dispositivos/${ap.deviceId}`}
                          className="text-sm font-medium hover:text-primary hover:underline"
                        >
                          {ap.code ? `${ap.code} · ` : ""}
                          {ap.name}
                        </Link>
                        {ap.ehTeste && (
                          <span className="text-xs text-muted">({t.home.testDevice})</span>
                        )}
                      </div>
                      <ul className="mt-1 flex flex-col gap-1">
                        {ap.itens.map((i) => (
                          <li
                            key={i.tipo}
                            className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
                          >
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                i.gravidade === "critico"
                                  ? "bg-warning/15 text-warning"
                                  : "bg-surface-2 text-muted"
                              }`}
                            >
                              {rotulo[i.tipo] ?? i.tipo}
                            </span>
                            <span className="text-xs text-muted">{i.detalhe}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      {/* O resumo aparece SEMPRE — com alarme ou sem. Era a tela mais visitada do
          painel entregando uma frase e 90% de tela preta nos dias bons. */}
      <ResumoDoDia resumo={resumo} ehOperadorDaPlataforma={ctx?.isSuperadmin ?? false} />

      {/* 60s e não 30s: a tela ganhou consultas. Todas leem o rollup (0,2 ms),
          mas dobrar o intervalo é de graça — ninguém opera loja em janela de
          trinta segundos. */}
      <AutoRefresh ms={60000} />
    </div>
  );
}
