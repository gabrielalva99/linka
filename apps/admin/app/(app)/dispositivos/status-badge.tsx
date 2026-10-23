import { DEVICE_STATUS_LABELS, type DeviceStatus } from "@linka/shared";

const DOT: Record<DeviceStatus, string> = {
  online: "bg-success",
  degraded: "bg-warning",
  offline: "bg-danger",
  provisioning: "bg-muted",
};

// `rotulo` é o aparelho que saiu da vitrine ("Fora da vitrine"). Vence o
// status de conexão, com ponto neutro: não é defeito de rede, é outro estado.
export function StatusBadge({
  status,
  rotulo,
}: {
  status: DeviceStatus;
  rotulo?: string | null;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span
        className={`inline-block h-2 w-2 rounded-full ${rotulo ? "bg-muted" : DOT[status]}`}
      />
      {rotulo ?? DEVICE_STATUS_LABELS[status]}
    </span>
  );
}
