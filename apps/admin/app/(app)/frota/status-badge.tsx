import { DEVICE_STATUS_LABELS, type DeviceStatus } from "@linka/shared";

const DOT: Record<DeviceStatus, string> = {
  online: "bg-success",
  degraded: "bg-warning",
  offline: "bg-danger",
  provisioning: "bg-muted",
};

export function StatusBadge({ status }: { status: DeviceStatus }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className={`inline-block h-2 w-2 rounded-full ${DOT[status]}`} />
      {DEVICE_STATUS_LABELS[status]}
    </span>
  );
}
