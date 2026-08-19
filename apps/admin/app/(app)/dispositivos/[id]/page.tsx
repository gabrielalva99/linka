import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTenant, porCliente, tenantFilter } from "@/lib/tenant";
import { getMessages } from "@/lib/i18n";
import { podeOperarAgora } from "@/lib/perms";
import { modelLabel } from "@/lib/device-display";
import {
  CONTENT_FIT_HINTS,
  DEVICE_MODE_LABELS,
  type ContentFit,
  type DeviceMode,
} from "@linka/shared";
import { AutoRefresh } from "../../auto-refresh";
import { ContentManager } from "./content-manager";
import { DeviceFit } from "./device-fit";
import { CleanupPanel } from "./cleanup-panel";
import { Quedas, type Queda } from "./quedas";
import { KioskPanel } from "./kiosk-panel";
import { JourneyPanel, type Journey } from "./journey-panel";
import { AppsPanel, type DeviceApp } from "./apps-panel";
import { PairingCard } from "./pairing-card";
import { PinNotice } from "./pin-notice";
import { ArchiveCard } from "./archive-card";
import { UpdateRetry } from "./update-retry";
import { FUSO_PADRAO, dataHora, nomeDaLoja } from "@/lib/datas";
import { decimal } from "@/lib/numeros";

type Rel = { name: string | null } | { name: string | null }[] | null;
const relName = (rel: Rel) =>
  (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "—";

type Media = { id: string; name: string; url: string; fit_mode: ContentFit };

/** "3h51" / "2d 4h" — reinício sozinho aparece como tempo baixo demais. */
function humanUptime(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h < 24) return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** dBm é ilegível para quem opera loja: traduz para palavra. */
function signalLabel(dbm: number | null): string {
  if (dbm == null) return "—";
  const quality =
    dbm >= -60 ? "ótimo" : dbm >= -70 ? "bom" : dbm >= -80 ? "fraco" : "ruim";
  return `${quality} (${dbm} dBm)`;
}

const CONNECTION_LABELS: Record<string, string> = {
  wifi: "Wi-Fi",
  cellular: "Chip / 5G",
  ethernet: "Cabo",
  none: "Sem rede",
};

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: device } = await supabase
    .from("devices")
    .select(
      "id, code, name, status, mode, battery_level, battery_charging, os_version, agent_version, content_url, content_fit, playing_url, playing_fit, provisioning_code, hardware_model, temperature_c, uptime_seconds, screen_on, connection, signal_dbm, is_device_owner, kiosk_locked, lock_task_on, maintenance_open, pending_command, idle_return_seconds, adb_enabled, last_command_result, cleanup_enabled, cleanup_time, last_cleanup_at, last_cleanup_result, update_error, update_state, block_settings, blocked_apps, screen_lock_set, exclude_from_reports, is_active, archived_at, archive_reason, retirado_em, retirado_por, retirado_cargo, retirado_loja, device_models(name), stores(name, timezone, retail_chains(name)), positions(label)",
    )
    .eq("id", id)
    .single();
  if (!device) notFound();

  const [
    { data: mediaData },
    tenant,
    { data: resolvedRows },
    { data: journeyData },
    { data: appsData },
    { data: saidasData },
    { data: quedasData },
  ] =
    await Promise.all([
      // Biblioteca do cliente ativo: oferecer o vídeo de outra marca na lista de
      // conteúdo é o caminho mais curto para a peça errada ir para a vitrine.
      porCliente(
        supabase.from("media_assets").select("id, name, url, fit_mode"),
        await tenantFilter(),
      ).order("created_at", { ascending: false }),
      getActiveTenant(),
      // Quem decide o que toca é o banco (fixo no aparelho > campanha mais específica).
      supabase.rpc("resolve_device_content", { p_device_id: id }),
      // O dia é o da loja: em fuso do servidor, loja fora de SP teria o
      // expediente cortado no meio.
      supabase.rpc("device_journey", { p_device_id: id }),
      // O que está instalado: o aparelho reporta, o painel não adivinha.
      supabase
        .from("device_apps")
        .select("package, label, version, is_system")
        .eq("device_id", id)
        .order("label"),
      // Saídas de manutenção deste aparelho.
      //
      // A tela do aparelho promete ao técnico que a saída "foi registrada no
      // painel". Se o painel não mostrasse, a promessa seria falsa — e a trilha
      // que ninguém consegue ler não serve para nada.
      supabase
        .from("audit_log")
        .select("created_at, metadata")
        .eq("entity", "device")
        .eq("entity_id", id)
        .eq("action", "saida_de_manutencao")
        .order("created_at", { ascending: false })
        .limit(5),
      // QUEDAS DO APLICATIVO, as recentes.
      //
      // Janela de 7 dias e teto explícito: queda de mês passado não ajuda a
      // resolver a de hoje, e sem limite uma sequência de falhas encheria a
      // ficha do aparelho — justamente na hora em que ela precisa estar legível.
      supabase
        .from("device_errors")
        .select("fingerprint, tipo, mensagem, pilha, agent_version, ocorreu_em")
        .eq("device_id", id)
        .gte("ocorreu_em", new Date(Date.now() - 7 * 24 * 3600_000).toISOString())
        .order("ocorreu_em", { ascending: false })
        .limit(50),
    ]);

  const t = getMessages();
  const podeOperar = await podeOperarAgora();
  const media = (mediaData ?? []) as Media[];
  // Hora do FATO é a hora da loja. Uma saída de manutenção às 20h em Manaus
  // aconteceu às 20h para quem estava lá; mostrar convertido para São Paulo
  // inventa um horário que ninguém viveu e atrapalha justamente quem vai
  // conferir a câmera da loja naquele horário.
  const lojaDoAparelho = (device as { stores: unknown }).stores as
    | { timezone: string | null }
    | { timezone: string | null }[]
    | null;
  const fusoDaLoja =
    (Array.isArray(lojaDoAparelho)
      ? lojaDoAparelho[0]?.timezone
      : lojaDoAparelho?.timezone) ?? FUSO_PADRAO;
  const saidas = (saidasData ?? []) as {
    created_at: string;
    metadata: { loja?: string; detalhe?: string } | null;
  }[];
  const d = device as {
    id: string;
    code: string | null;
    name: string;
    mode: DeviceMode | null;
    battery_level: number | null;
    battery_charging: boolean | null;
    os_version: string | null;
    agent_version: string | null;
    content_url: string | null;
    content_fit: ContentFit | null;
    playing_url: string | null;
    playing_fit: ContentFit | null;
    provisioning_code: string | null;
    hardware_model: string | null;
    temperature_c: number | string | null;
    uptime_seconds: number | null;
    screen_on: boolean | null;
    connection: string | null;
    signal_dbm: number | null;
    is_device_owner: boolean;
    kiosk_locked: boolean;
    lock_task_on: boolean | null;
    maintenance_open: boolean;
    pending_command: string | null;
    idle_return_seconds: number;
    adb_enabled: boolean | null;
    last_command_result: string | null;
    cleanup_enabled: boolean;
    cleanup_time: string;
    last_cleanup_at: string | null;
    last_cleanup_result: string | null;
    update_error: string | null;
    update_state: string | null;
    block_settings: boolean;
    blocked_apps: string | null;
    screen_lock_set: boolean | null;
    exclude_from_reports: boolean;
    is_active: boolean;
    archived_at: string | null;
    archive_reason: string | null;
    retirado_em: string | null;
    retirado_por: string | null;
    retirado_cargo: string | null;
    retirado_loja: string | null;
    device_models: Rel;
    stores:
      | { name: string | null; timezone: string | null }
      | { name: string | null; timezone: string | null }[]
      | null;
    positions: { label: string | null } | { label: string | null }[] | null;
  };

  // O aparelho reporta o próprio modelo; o catálogo só refina o nome comercial.
  const model = modelLabel(relName(d.device_models), d.hardware_model, t.device.detected);
  const positionLabel =
    (Array.isArray(d.positions) ? d.positions[0]?.label : d.positions?.label) ?? "—";

  const info: [string, string][] = [
    [t.device.code, d.code ?? "—"],
    [t.device.model, model],
    [t.device.store, nomeDaLoja(d.stores as never) ?? relName(d.stores)],
    [t.device.position, positionLabel],
    [t.device.mode, d.mode ? DEVICE_MODE_LABELS[d.mode] : "—"],
    [
      t.device.battery,
      d.battery_level != null
        ? `${d.battery_level}%${d.battery_charging ? " ⚡" : ""}`
        : "—",
    ],
    [t.device.os, d.os_version ?? "—"],
    [t.device.version, d.agent_version ?? "—"],
    [t.device.pairing, d.provisioning_code ?? "—"],
  ];

  // Saúde: a resposta para "por que essa loja não está no ar?".
  const temp = d.temperature_c != null ? Number(d.temperature_c) : null;
  const health: [string, string][] = [
    [
      t.device.temperature,
      temp != null ? `${decimal(temp)} °C${temp >= 40 ? " ⚠️" : ""}` : "—",
    ],
    [t.device.uptime, humanUptime(d.uptime_seconds)],
    [
      t.device.screen,
      d.screen_on == null ? "—" : d.screen_on ? t.device.screenOn : t.device.screenOff,
    ],
    [
      t.device.connection,
      d.connection ? (CONNECTION_LABELS[d.connection] ?? d.connection) : "—",
    ],
    [t.device.signal, signalLabel(d.signal_dbm)],
  ];

  // O que este aparelho DEVE exibir agora, já com a precedência resolvida.
  const resolved = (
    Array.isArray(resolvedRows) ? resolvedRows[0] : null
  ) as {
    out_url: string | null;
    out_fit: ContentFit | null;
    out_source: string | null;
    out_campaign_name: string | null;
  } | null;

  const assignedUrl = resolved?.out_url ?? null;
  const assigned = assignedUrl
    ? (media.find((m) => m.url === assignedUrl) ?? null)
    : null;
  const assignedName = assignedUrl
    ? (assigned?.name ??
      decodeURIComponent(assignedUrl.split("/").pop() ?? assignedUrl))
    : null;
  const inheritedFit = assigned?.fit_mode ?? "zoom";
  const effectiveFit = resolved?.out_fit ?? d.content_fit ?? inheritedFit;
  const sourceLabel =
    resolved?.out_source === "campaign"
      ? `${t.device.fromCampaign}: ${resolved.out_campaign_name}`
      : resolved?.out_source === "device"
        ? t.device.fromDevice
        : null;

  const fitOk = assignedUrl == null || d.playing_fit === effectiveFit;
  const isLive = assignedUrl != null && d.playing_url === assignedUrl && fitOk;

  const badge = !assignedUrl
    ? { text: t.device.contentNone, cls: "bg-surface-2 text-muted" }
    : isLive
      ? { text: t.device.contentLive, cls: "bg-success/15 text-success" }
      : { text: t.device.contentPending, cls: "bg-warning/15 text-warning" };

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dispositivos" className="text-sm text-muted hover:underline">
        ← {t.device.back}
      </Link>
      <div className="mt-2 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{d.name}</h1>
        {podeOperar && (
        <Link
          href={`/dispositivos/${d.id}/editar`}
          className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-surface-2"
        >
          {t.device.edit}
        </Link>
        )}
      </div>

      {/* Aparelho que nunca reportou: a instrução de pareamento vem antes de
          qualquer dado, porque não existe dado nenhum para ler ainda. */}
      {d.agent_version == null && <PairingCard code={d.provisioning_code} />}

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {info.map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-surface p-4">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="mt-1 text-sm">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-muted">{t.device.health}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {health.map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line bg-surface p-4">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="mt-1 text-sm">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Senha de tela: não dá para apagar neste hardware, então o painel
          precisa gritar antes de o aparelho ir para a loja. */}
      {d.screen_lock_set && (
        <p className="mt-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-xs text-warning">
          {t.device.screenLockWarning}
        </p>
      )}

      {/* O MEIO DO CAMINHO. `update_error` só aparece depois de o aparelho
          DESISTIR; até lá, um aparelho parado na versão velha era idêntico a um
          em dia. Foi assim que o Moto G06 passou horas atrás sem nada acusar, e
          só apareceu quando o Gabriel comparou versões na lista de frota. */}
      {!d.update_error && d.update_state && (
        <div className="mt-6 rounded-lg border border-line bg-surface px-4 py-3">
          <p className="text-xs text-muted">
            {t.device.updateProgress}: {d.update_state}
          </p>
          {podeOperar && (
            <div className="mt-2">
              <UpdateRetry deviceId={d.id} />
            </div>
          )}
        </div>
      )}

      {d.update_error && (
        <div className="mt-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <p className="text-xs text-warning">
            {t.device.updateBlocked}: {d.update_error}
          </p>
          {/* O aviso sem saída era o defeito: informava e deixava a pessoa sem
              nada para fazer, a não ser levar um notebook até a loja. */}
          {podeOperar && (
            <div className="mt-2">
              <UpdateRetry deviceId={d.id} />
            </div>
          )}
        </div>
      )}

      <JourneyPanel
        journey={(journeyData as Journey | null) ?? null}
        excluded={d.exclude_from_reports}
        deviceId={d.id}
        podeOperar={podeOperar}
      />

      {d.retirado_em && (
        /* RETIRADO PARA VENDA. Vem antes de tudo porque muda a leitura da página
           inteira: sem isto, um aparelho vendido parece um aparelho com defeito
           — offline, sem vídeo, sem bateria — e alguém sai atrás de um problema
           que não existe. */
        <section className="mt-8 rounded-xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">Retirado da vitrine para venda</h2>
          <p className="mt-2 text-sm">
            {d.retirado_por}
            {d.retirado_cargo ? ` · ${d.retirado_cargo}` : ""}
            {d.retirado_loja ? ` · ${d.retirado_loja}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted">
            {dataHora(d.retirado_em, fusoDaLoja)} · informado no próprio aparelho,
            com o PIN de manutenção da loja
          </p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium text-muted">{t.device.kiosk}</h2>
        {podeOperar && (
        <>
        <KioskPanel
          deviceId={d.id}
          isDeviceOwner={d.is_device_owner}
          kioskLocked={d.kiosk_locked}
          lockTaskOn={d.lock_task_on}
          maintenanceOpen={d.maintenance_open}
          pendingCommand={d.pending_command}
          idleReturnSeconds={d.idle_return_seconds}
          adbEnabled={d.adb_enabled}
          lastCommandResult={d.last_command_result}
          blockSettings={d.block_settings}
          blockedApps={d.blocked_apps}
        />
        <Quedas quedas={(quedasData ?? []) as Queda[]} fuso={fusoDaLoja} />

        <CleanupPanel
          deviceId={d.id}
          enabled={d.cleanup_enabled}
          time={d.cleanup_time}
          lastAt={d.last_cleanup_at}
          lastResult={d.last_cleanup_result}
          pendingCommand={d.pending_command}
          fuso={fusoDaLoja}
        />
        </>
        )}
      </section>

      <AppsPanel
        deviceId={d.id}
        apps={(appsData ?? []) as DeviceApp[]}
        pendingCommand={d.pending_command}
        podeOperar={podeOperar}
      />

      <section className="mt-8">
        <h2 className="text-sm font-medium text-muted">{t.device.content}</h2>

        <div className="mt-3 rounded-xl border border-line bg-surface p-5">
          {podeOperar && d.content_url && <PinNotice deviceId={d.id} />}

          <div className="mb-5 flex items-center justify-between gap-3 border-b border-line pb-4">
            <div className="min-w-0">
              <p className="text-xs text-muted">{t.device.contentCurrent}</p>
              <p className="truncate text-sm font-medium">
                {assignedName ?? t.device.contentNone}
              </p>
              {sourceLabel && (
                <p className="mt-0.5 truncate text-xs text-muted">{sourceLabel}</p>
              )}
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${badge.cls}`}
            >
              {badge.text}
            </span>
          </div>

          {podeOperar && !assignedUrl && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
              <span className="text-xs text-warning">{t.device.noContentWarning}</span>
              <Link
                href="/campanhas/nova"
                className="shrink-0 rounded-md border border-warning/40 px-3 py-1.5 text-xs font-medium text-warning hover:bg-warning/10"
              >
                {t.device.createCampaign}
              </Link>
            </div>
          )}

          {podeOperar && assigned && (
            <div className="mb-5 flex flex-col gap-2 border-b border-line pb-5">
              <span className="text-xs text-muted">{t.device.fit}</span>
              <DeviceFit
                deviceId={d.id}
                value={d.content_fit}
                inherited={inheritedFit}
              />
              <span className="text-xs text-muted">
                {CONTENT_FIT_HINTS[effectiveFit]}
              </span>
            </div>
          )}

          {podeOperar && (
          <ContentManager
            deviceId={d.id}
            tenantId={tenant?.id ?? ""}
            currentUrl={d.content_url}
            media={media}
          />
          )}
        </div>
      </section>

      {/* Quem destravou este aparelho na loja, e quando.
          Só aparece quando aconteceu: seção vazia em toda ficha de aparelho é
          ruído em 250 telas para servir a um caso raro. */}
      {saidas.length > 0 && (
        <section className="mt-6 rounded-xl border border-line bg-surface p-5">
          <h2 className="text-sm font-medium">Saídas de manutenção na loja</h2>
          <p className="mt-1 text-xs text-muted">
            Alguém digitou o PIN na tela do aparelho e destravou a vitrine por 5
            minutos.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {saidas.map((s, i) => (
              <li
                key={`${s.created_at}-${i}`}
                className="flex flex-wrap items-baseline gap-x-2 border-b border-line pb-2 text-sm last:border-0 last:pb-0"
              >
                <span className="font-medium">
                  {dataHora(s.created_at, fusoDaLoja)}
                </span>
                <span className="text-xs text-muted">
                  {s.metadata?.loja ?? "sem loja"} · {s.metadata?.detalhe ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* No fim da ficha e sem destaque: é a ação mais rara desta tela e a que
          mais incomoda se for clicada por engano. */}
      {podeOperar && (
        <ArchiveCard
          deviceId={d.id}
          arquivado={!d.is_active}
          motivo={d.archive_reason}
          desde={d.archived_at}
        />
      )}

      <AutoRefresh ms={5000} />
    </div>
  );
}
