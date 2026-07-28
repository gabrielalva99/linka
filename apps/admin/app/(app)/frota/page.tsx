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
import { StatusBadge } from "./status-badge";
import { TypeTabs } from "./type-tabs";
import { Filters } from "./filters";

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
  // Código de inscrição do cliente: é o que vai no kit de campo.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("enrollment_code")
    .limit(1)
    .maybeSingle();
  const { data: release } = await supabase
    .from("agent_releases")
    .select("version")
    .eq("is_current", true)
    .maybeSingle();
  const { data: lojasData } = await supabase
    .from("stores")
    .select("id, name")
    .order("name");
  const { data } = await supabase
    .from("devices")
    .select(
      "id, code, name, status, mode, battery_level, battery_charging, synced, agent_version, last_seen_at, device_type, hardware_model, kiosk_locked, store_id, device_models(name), stores(name)",
    )
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
    if (situacao) {
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
  const online = daAba.filter(
    (d) => effectiveStatus(d.status, d.last_seen_at) === "online",
  ).length;
  const synced = daAba.filter((d) => d.synced).length;
  const publicada = publicadaAgora;
  const updated = publicada
    ? daAba.filter((d) => d.agent_version === publicada).length
    : 0;
  // Aparelho sem bloqueio não aceita trava de Wi-Fi nem atualização remota:
  // precisa aparecer aqui, não ser descoberto um por um.
  const locked = daAba.filter((d) => d.kiosk_locked).length;
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
        <Kpi label={t.fleet.active} value={online} total={total} />
        <Kpi label={t.fleet.locked} value={locked} total={total} />
        <Kpi label={t.fleet.synced} value={synced} total={total} />
        <Kpi label={t.fleet.updated} value={updated} total={total} />
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

      <div className="mt-6 overflow-x-auto rounded-xl border border-line">
        {devices.length > 0 ? (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{t.fleet.colStatus}</th>
                <th className="px-4 py-2 font-medium">{t.fleet.colCode}</th>
                <th className="px-4 py-2 font-medium">{t.fleet.colName}</th>
                <th className="px-4 py-2 font-medium">{t.fleet.colModel}</th>
                <th className="px-4 py-2 font-medium">{t.fleet.colStore}</th>
                <th className="px-4 py-2 font-medium">{t.fleet.colMode}</th>
                <th className="px-4 py-2 font-medium">{t.fleet.colBattery}</th>
                <th className="px-4 py-2 font-medium">{t.fleet.colVersion}</th>
                <th className="px-4 py-2 font-medium">{t.fleet.colLastSeen}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {devices.map((d) => (
                <tr key={d.id} className="bg-surface">
                  <td className="px-4 py-3">
                    <StatusBadge status={effectiveStatus(d.status, d.last_seen_at)} />
                  </td>
                  <td className="px-4 py-3 text-muted">{d.code ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/frota/${d.id}`}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {d.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {modelLabel(
                      relName(d.device_models),
                      d.hardware_model,
                      t.device.detected,
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {d.store_id ? (
                      <Link
                        href={`/lojas/${d.store_id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {relName(d.stores)}
                      </Link>
                    ) : (
                      relName(d.stores)
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {d.mode ? DEVICE_MODE_LABELS[d.mode] : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {d.battery_level != null ? `${d.battery_level}%` : "—"}
                    {d.battery_charging ? " ⚡" : ""}
                  </td>
                  <td className="px-4 py-3 text-muted">{d.agent_version ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    {relativeLastSeen(d.last_seen_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="bg-surface px-4 py-8 text-center text-sm text-muted">
            {/* Lista vazia por causa de filtro não é frota vazia. Dizer
                "nenhum aparelho cadastrado" com 250 no banco faz a pessoa achar
                que perdeu tudo. */}
            {busca || loja || situacao ? t.fleet.noResults : t.fleet.empty}
          </p>
        )}
      </div>
    </div>
  );
}
