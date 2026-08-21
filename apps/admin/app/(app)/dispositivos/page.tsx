import { nomeDaLoja } from "@/lib/datas";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import {
  DEVICE_MODE_LABELS,
  DEVICE_TYPE,
  type DeviceMode,
  type DeviceStatus,
  type DeviceType,
} from "@linka/shared";
import { modelLabel } from "@/lib/device-display";
import { getSessionContext } from "@/lib/auth";
import { podeOperar, ehOperadorDaPlataforma } from "@/lib/perms";
import {
  getActiveTenant,
  porCliente,
  tenantFilter,
  toleranciaSemContatoMs,
} from "@/lib/tenant";
import { TypeTabs } from "./type-tabs";
import { Filters } from "./filters";
import { FleetTable } from "./fleet-table";

type Rel = { name: string | null } | { name: string | null }[] | null;
type DeviceRow = {
  id: string;
  code: string | null;
  name: string;
  status: DeviceStatus;
  mode: DeviceMode | null;
  battery_level: number | null;
  battery_charging: boolean | null;
  synced: boolean;
  agent_version: string | null;
  last_seen_at: string | null;
  device_type: DeviceType;
  hardware_model: string | null;
  kiosk_locked: boolean;
  store_id: string | null;
  device_models: Rel;
  stores: Rel;
};

const relName = (rel: Rel) =>
  (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "—";

// Um aparelho que parou de reportar não envia "offline" — ele só some. Então o
// status honesto é derivado do último contato. Quanto tempo de silêncio conta
// como fora do ar não é decidido aqui: vem do ritmo configurado (ver
// toleranciaSemContatoMs), porque esse ritmo é ajustável e um número escrito
// nesta tela ficaria para trás sozinho.
function effectiveStatus(
  status: DeviceStatus,
  lastSeen: string | null,
  toleranciaMs: number,
): DeviceStatus {
  if (!lastSeen) return status;
  const age = Date.now() - new Date(lastSeen).getTime();
  if (age > toleranciaMs) return "offline";
  return status;
}

/**
 * Compara "0.37.0" com "0.36.0" por número, não por texto.
 *
 * Comparação de texto erra feio na primeira dezena: "0.9.0" > "0.10.0" em ordem
 * alfabética. Com 250 aparelhos e uma versão por semana, isso chega em meses.
 */
function compararVersao(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function relativeLastSeen(ts: string | null): string {
  if (!ts) return "—";
  const min = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function Kpi({ label, value, total }: { label: string; value: number; total: number }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-sm font-medium text-muted">{label}</h2>
      <p className="mt-1 text-2xl font-semibold">
        {value}
        <span className="text-base font-normal text-muted"> / {total}</span>
      </p>
    </section>
  );
}

export default async function FrotaPage({
  searchParams,
}: {
  searchParams: Promise<{
    tipo?: string;
    q?: string;
    loja?: string;
    situacao?: string;
  }>;
}) {
  const { tipo, q, loja, situacao } = await searchParams;
  const busca = (q ?? "").trim().toLowerCase();
  const activeType = (DEVICE_TYPE as readonly string[]).includes(tipo ?? "")
    ? (tipo as DeviceType)
    : null;

  const supabase = await createSupabaseServerClient();
  // A versão publicada vem junto: quem sabe se o aparelho está atualizado é o
  // servidor, comparando o que está instalado com o que foi publicado. Antes
  // esse fato vinha do próprio aparelho e chegava atrasado, então a tela dizia
  // "1 de 2" com os dois já na versão nova.
  // Código de inscrição do CLIENTE ATIVO. Vinha do primeiro cliente cadastrado:
  // com duas marcas, o kit de campo sairia com o código da marca errada e os
  // aparelhos entrariam na frota de outro cliente.
  const cliente = await getActiveTenant();
  const filtro = await tenantFilter();
  const toleranciaMs = toleranciaSemContatoMs(cliente);
  const { data: tenant } = cliente
    ? await supabase
        .from("tenants")
        .select("enrollment_code")
        .eq("id", cliente.id)
        .maybeSingle()
    : { data: null };
  //
  // São VÁRIAS: desde 20/08 a versão publicada pode mirar um tipo de aparelho,
  // então o celular e a TV podem estar em versões diferentes de propósito.
  const { data: releasesNoAr } = await supabase
    .from("agent_releases")
    .select("version, target_device_type")
    .eq("is_current", true);
  const { data: lojasData } = await porCliente(
    supabase.from("stores").select("id, name"),
    filtro,
  ).order("name");
  // Modelos entram para a ação em massa: aparelho que se cadastra sozinho às
  // vezes não bate com nenhum modelo do catálogo, e corrigir isso um a um em 250
  // é o mesmo problema da loja.
  const { data: modelosData } = await porCliente(
    supabase.from("device_models").select("id, name, line"),
    filtro,
  ).order("name");
  // Aparelho arquivado sai da lista por padrão: ele não está mais na rua, e
  // deixá-lo aqui faz o total da frota mentir. O filtro "arquivados" é o único
  // jeito de vê-los, e aí a lista mostra SÓ eles.
  const soArquivados = situacao === "arquivados";
  const { data } = await porCliente(
    supabase
      .from("devices")
      .select(
        "id, code, name, status, mode, battery_level, battery_charging, synced, agent_version, last_seen_at, device_type, hardware_model, kiosk_locked, store_id, is_active, archive_reason, device_models(name), stores(name, retail_chains(name))",
      ),
    filtro,
  )
    .eq("is_active", !soArquivados)
    .order("code", { ascending: true });
  // A CAMPANHA DE CADA APARELHO, em uma consulta só.
  //
  // Vem da view que reusa a mesma regra que o aparelho obedece (prioridade do
  // alvo, janela de datas, horário da loja). Consultar aqui, e não dentro do
  // laço, evita uma ida ao banco por linha — com 250 aparelhos isso seria a
  // diferença entre a lista abrir e a lista travar.
  const { data: campanhas } = await porCliente(
    supabase.from("v_campanha_do_aparelho").select("device_id, campanha"),
    filtro,
  );
  // QUEM TEM APLICATIVO FORA DE FABRICA, em uma consulta so.
  //
  // Mesma razao da campanha logo acima: com 250 aparelhos, perguntar por linha
  // seria a diferenca entre a lista abrir e a lista travar.
  const { data: appsExtras } = await supabase.rpc(
    "aparelhos_com_app_fora_de_fabrica_lista",
    { p_tenant: filtro },
  );
  const appExtraPorAparelho = new Map(
    ((appsExtras ?? []) as { device_id: string; quantos: number; apps: string }[]).map(
      (x) => [x.device_id, x],
    ),
  );

  const campanhaPorAparelho = new Map(
    ((campanhas ?? []) as { device_id: string; campanha: string | null }[]).map((c) => [
      c.device_id,
      c.campanha,
    ]),
  );

  const t = getMessages();
  const ctx = await getSessionContext();
  const podeMexer = podeOperar(ctx);
  const ehPlataforma = ehOperadorDaPlataforma(ctx);
  const all = (data ?? []) as DeviceRow[];

  // Contagem por tipo sai da lista completa; as abas não podem depender do filtro.
  const counts: Record<string, number> = {};
  for (const d of all) counts[d.device_type] = (counts[d.device_type] ?? 0) + 1;

  // Os KPIs seguem a ABA, não a busca: um filtro de texto não pode fazer o
  // painel dizer que a frota inteira está no ar porque sobrou um aparelho.
  const daAba = activeType
    ? all.filter((d) => d.device_type === activeType)
    : all;

  /**
   * Qual versão ESTE tipo de aparelho deveria estar rodando.
   *
   * Repete a regra de `release_atual` no banco — a versão mirada no tipo vence a
   * geral. Tem que repetir: se esta tela usasse a geral para todo mundo, uma TV
   * na versão certa dela apareceria como "desatualizada" para sempre, e o filtro
   * "com problema" viveria acusando aparelho que está exatamente onde deveria.
   */
  const noArPorAlvo = (releasesNoAr ?? []) as {
    version: string;
    target_device_type: string | null;
  }[];
  const publicadaGeral =
    noArPorAlvo.find((r) => r.target_device_type === null)?.version ?? null;
  const publicadaPara = (tipoDoAparelho: string): string | null =>
    noArPorAlvo.find((r) => r.target_device_type === tipoDoAparelho)?.version ??
    publicadaGeral;
  const devices = daAba.filter((d) => {
    if (busca) {
      // Inclui o nome do CATÁLOGO, e não só o do hardware.
      //
      // Sem isso, buscar "Razr 60 Ultra" (o nome comercial que a tela de Modelos
      // mostra) só funcionava por coincidência, quando o texto do hardware era
      // parecido. É também o que faz o link vindo de Modelos cair na lista certa.
      const alvo = `${d.code ?? ""} ${d.name} ${nomeDaLoja(d.stores as never) ?? ""} ${
        d.hardware_model ?? ""
      } ${relName(d.device_models)}`.toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    if (loja === "sem") {
      if (d.store_id) return false;
    } else if (loja) {
      if (d.store_id !== loja) return false;
    }
    // "arquivados" já foi resolvido na consulta; aqui ele não filtra mais nada.
    if (situacao && situacao !== "arquivados") {
      const fora = effectiveStatus(d.status, d.last_seen_at, toleranciaMs) !== "online";
      if (situacao === "offline" && !fora) return false;
      if (situacao === "sem_travas" && d.kiosk_locked) return false;
      if (situacao === "app_extra" && !appExtraPorAparelho.has(d.id)) return false;
      const publicadaDele = publicadaPara(d.device_type);
      if (
        situacao === "desatualizado" &&
        (!publicadaDele || d.agent_version === publicadaDele)
      ) {
        return false;
      }
      // "Com problema" é o guarda-chuva: qualquer um dos anteriores, mais
      // aparelho sem loja, que é o que impede campanha de alcançar.
      if (situacao === "problema") {
        const desatualizado =
          publicadaDele != null && d.agent_version !== publicadaDele;
        if (!fora && d.kiosk_locked && !desatualizado && d.store_id) return false;
      }
    }
    return true;
  });

  const total = daAba.length;
  // Os que estão falando com o painel agora. Tudo que é ESTADO do aparelho é
  // contado só entre eles.
  //
  // Antes a tela dizia "No ar 2 de 6" e, logo ao lado, "Protegidos 6 de 6".
  // Não dá para afirmar que um aparelho está protegido, sincronizado ou
  // atualizado quando ele não fala há três horas: o que existe é o último
  // estado conhecido, e último estado conhecido de um aparelho sumido é
  // exatamente o que não se deve exibir como fato.
  const noAr = daAba.filter(
    (d) => effectiveStatus(d.status, d.last_seen_at, toleranciaMs) === "online",
  );
  const online = noAr.length;
  const synced = noAr.filter((d) => d.synced).length;
  // "Atualizado" é estar na publicada OU À FRENTE dela.
  //
  // A comparação era de igualdade, então um aparelho com versão mais nova que a
  // publicada aparecia como desatualizado — foi o que a tela mostrou depois de
  // um teste por cabo: 0 de 2 atualizados, com um aparelho à frente da frota.
  // Igualdade só funciona enquanto ninguém nunca sai da fila.
  //
  // A comparação é POR APARELHO, e não contra uma versão só: com a aba "todos"
  // aberta a lista mistura celular e TV, que podem estar em versões publicadas
  // diferentes de propósito.
  const updated = noAr.filter((d) => {
    const publicadaDele = publicadaPara(d.device_type);
    return (
      publicadaDele != null &&
      d.agent_version != null &&
      compararVersao(d.agent_version, publicadaDele) >= 0
    );
  }).length;
  // Aparelho sem bloqueio não aceita trava de Wi-Fi nem atualização remota:
  // precisa aparecer aqui, não ser descoberto um por um.
  //
  // A LISTA é a fonte, e a conta sai dela. Guardar só o número obrigava quem lê
  // o aviso a caçar o aparelho na tabela: "1 aparelho sem bloqueio" sem dizer
  // qual é uma tarefa, não um aviso.
  const semBloqueio = noAr.filter((d) => !d.kiosk_locked);
  const locked = noAr.length - semBloqueio.length;
  // Aparelho que se cadastrou sozinho chega sem loja. É o único dado que ele
  // não tem como descobrir, e sem ele nenhuma campanha alcança o aparelho.
  const semLoja = daAba.filter((d) => !d.store_id);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t.fleet.title}</h1>
        <div className="flex items-center gap-3">
          {ehPlataforma && (
            <Link href="/dispositivos/versoes" className="text-sm text-muted hover:underline">
              Versões do agente
            </Link>
          )}
          {podeMexer && (
            <Link href="/dispositivos/modelos" className="text-sm text-muted hover:underline">
              {t.models.manage}
            </Link>
          )}
          {podeMexer && (
          <Link
            href="/dispositivos/novo"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            {t.deviceForm.new}
          </Link>
          )}
        </div>
      </div>

      <TypeTabs active={activeType} counts={counts} />

      <Filters
        lojas={(lojasData ?? []).map((l) => ({
          id: l.id as string,
          nome: l.name as string,
        }))}
        busca={q ?? ""}
        loja={loja ?? ""}
        situacao={situacao ?? ""}
      />

      {/* O código do cliente inteiro, não um por aparelho: é ele que vai no kit
          do técnico e faz o aparelho se cadastrar sozinho. */}
      {podeMexer && tenant?.enrollment_code && (
        <p className="mt-4 text-xs text-muted">
          Código de inscrição para o kit de campo:{" "}
          <span className="rounded bg-surface-2 px-2 py-1 font-mono text-sm text-foreground">
            {tenant.enrollment_code}
          </span>{" "}
          o aparelho entra na frota sozinho e você só define a loja.
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {/* "No ar" se mede contra a frota inteira. O resto se mede contra os
            que estão no ar: de quem sumiu, a gente não sabe nada. */}
        <Kpi label={t.fleet.active} value={online} total={total} />
        <Kpi label={t.fleet.locked} value={locked} total={online} />
        <Kpi label={t.fleet.synced} value={synced} total={online} />
        <Kpi label={t.fleet.updated} value={updated} total={online} />
      </div>

      {semLoja.length > 0 && (
        <div className="mt-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3">
          <p className="text-xs text-primary">
            {semLoja.length === 1
              ? "1 aparelho chegou e ainda não tem loja."
              : `${semLoja.length} aparelhos chegaram e ainda não têm loja.`}{" "}
            Sem loja definida, nenhuma campanha alcança o aparelho.
          </p>
          <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
            {semLoja.map((d) => (
              <Link
                key={d.id}
                href={`/dispositivos/${d.id}/editar`}
                className="hover:text-primary hover:underline"
              >
                {d.name}
              </Link>
            ))}
          </p>
        </div>
      )}

      {/* Compara com quem está NO AR, e não com a frota inteira.
          Antes `locked` contava entre os que respondem e era comparado com o
          total: um aparelho desligado virava "sem bloqueio" e a tela pedia um
          procedimento por cabo para um aparelho que não está lá. Pior, os
          indicadores logo acima já dizem "dos que estão no ar" — duas contas
          diferentes na mesma tela ensinam a não confiar em nenhuma. */}
      {semBloqueio.length > 0 && (
        <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <p className="text-xs text-warning">
            {t.fleet.unlockedWarning.replace("{n}", String(semBloqueio.length))}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
            {semBloqueio.map((d) => (
              <Link
                key={d.id}
                href={`/dispositivos/${d.id}`}
                className="hover:text-warning hover:underline"
              >
                {d.name}
              </Link>
            ))}
          </p>
        </div>
      )}

      {devices.length > 0 ? (
        <FleetTable
          linhas={devices.map((d) => ({
            id: d.id,
            status: effectiveStatus(d.status, d.last_seen_at, toleranciaMs),
            codigo: d.code ?? "—",
            nome: d.name,
            modelo: modelLabel(
              relName(d.device_models),
              d.hardware_model,
              t.device.detected,
            ),
            lojaId: d.store_id,
            lojaNome: nomeDaLoja(d.stores as never) ?? "",
            campanha: campanhaPorAparelho.get(d.id as string) ?? null,
            modo: d.mode ? DEVICE_MODE_LABELS[d.mode] : "—",
            bateria:
              (d.battery_level != null ? `${d.battery_level}%` : "—") +
              (d.battery_charging ? " ⚡" : ""),
            versao: d.agent_version ?? "—",
            visto: relativeLastSeen(d.last_seen_at),
          }))}
          lojas={(lojasData ?? []).map((l) => ({
            id: l.id as string,
            nome: l.name as string,
          }))}
          modelos={(modelosData ?? []).map((m) => ({
            id: m.id as string,
            nome: (m.line ? `${m.name} (${m.line})` : m.name) as string,
          }))}
          podeMexer={podeMexer}
        />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-line">
          <p className="bg-surface px-4 py-8 text-center text-sm text-muted">
            {/* Lista vazia por causa de filtro não é frota vazia. Dizer
                "nenhum aparelho cadastrado" com 250 no banco faz a pessoa achar
                que perdeu tudo. */}
            {busca || loja || situacao ? t.fleet.noResults : t.fleet.empty}
          </p>
        </div>
      )}
    </div>
  );
}
