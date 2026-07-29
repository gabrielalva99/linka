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
import { getActiveTenant, porCliente, tenantFilter } from "@/lib/tenant";
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

// Um aparelho que parou de reportar não envia "offline" — ele só some. Então o status
// honesto é derivado do último contato: sem sinal há > 3 min = fora do ar.
const STALE_MS = 3 * 60 * 1000;
function effectiveStatus(status: DeviceStatus, lastSeen: string | null): DeviceStatus {
  if (!lastSeen) return status;
  const age = Date.now() - new Date(lastSeen).getTime();
  if (age > STALE_MS) return "offline";
  return status;
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
  const { data: tenant } = cliente
    ? await supabase
        .from("tenants")
        .select("enrollment_code")
        .eq("id", cliente.id)
        .maybeSingle()
    : { data: null };
  const { data: release } = await supabase
    .from("agent_releases")
    .select("version")
    .eq("is_current", true)
    .maybeSingle();
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
        "id, code, name, status, mode, battery_level, battery_charging, synced, agent_version, last_seen_at, device_type, hardware_model, kiosk_locked, store_id, is_active, archive_reason, device_models(name), stores(name)",
      ),
    filtro,
  )
    .eq("is_active", !soArquivados)
    .order("code", { ascending: true });
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

  const publicadaAgora = release?.version ?? null;
  const devices = daAba.filter((d) => {
    if (busca) {
      const alvo = `${d.code ?? ""} ${d.name} ${relName(d.stores)} ${
        d.hardware_model ?? ""
      }`.toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    if (loja === "sem") {
      if (d.store_id) return false;
    } else if (loja) {
      if (d.store_id !== loja) return false;
    }
    // "arquivados" já foi resolvido na consulta; aqui ele não filtra mais nada.
    if (situacao && situacao !== "arquivados") {
      const fora = effectiveStatus(d.status, d.last_seen_at) !== "online";
      if (situacao === "offline" && !fora) return false;
      if (situacao === "sem_travas" && d.kiosk_locked) return false;
      if (
        situacao === "desatualizado" &&
        (!publicadaAgora || d.agent_version === publicadaAgora)
      ) {
        return false;
      }
      // "Com problema" é o guarda-chuva: qualquer um dos anteriores, mais
      // aparelho sem loja, que é o que impede campanha de alcançar.
      if (situacao === "problema") {
        const desatualizado =
          publicadaAgora != null && d.agent_version !== publicadaAgora;
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
    (d) => effectiveStatus(d.status, d.last_seen_at) === "online",
  );
  const online = noAr.length;
  const synced = noAr.filter((d) => d.synced).length;
  const publicada = publicadaAgora;
  const updated = publicada
    ? noAr.filter((d) => d.agent_version === publicada).length
    : 0;
  // Aparelho sem bloqueio não aceita trava de Wi-Fi nem atualização remota:
  // precisa aparecer aqui, não ser descoberto um por um.
  const locked = noAr.filter((d) => d.kiosk_locked).length;
  // Aparelho que se cadastrou sozinho chega sem loja. É o único dado que ele
  // não tem como descobrir, e sem ele nenhuma campanha alcança o aparelho.
  const semLoja = daAba.filter((d) => !d.store_id);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t.fleet.title}</h1>
        <div className="flex items-center gap-3">
          {ehPlataforma && (
            <Link href="/frota/versoes" className="text-sm text-muted hover:underline">
              Versões do agente
            </Link>
          )}
          {podeMexer && (
            <Link href="/frota/modelos" className="text-sm text-muted hover:underline">
              {t.models.manage}
            </Link>
          )}
          {podeMexer && (
          <Link
            href="/frota/novo"
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
                href={`/frota/${d.id}/editar`}
                className="hover:text-primary hover:underline"
              >
                {d.name}
              </Link>
            ))}
          </p>
        </div>
      )}

      {locked < total && (
        <p className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-xs text-warning">
          {t.fleet.unlockedWarning.replace("{n}", String(total - locked))}
        </p>
      )}

      {devices.length > 0 ? (
        <FleetTable
          linhas={devices.map((d) => ({
            id: d.id,
            status: effectiveStatus(d.status, d.last_seen_at),
            codigo: d.code ?? "—",
            nome: d.name,
            modelo: modelLabel(
              relName(d.device_models),
              d.hardware_model,
              t.device.detected,
            ),
            lojaId: d.store_id,
            lojaNome: relName(d.stores),
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
