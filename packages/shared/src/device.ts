/** Estados e plataformas de um dispositivo da frota (ARQUITETURA §4, REFERENCIA §2). */
export const DEVICE_STATUS = ["provisioning", "online", "degraded", "offline"] as const;
export type DeviceStatus = (typeof DEVICE_STATUS)[number];

export const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  provisioning: "Provisionando",
  online: "No ar",
  degraded: "Instável",
  offline: "Fora do ar",
};

/** Modo/estado operacional do aparelho (máquina de estados do agente). */
export const DEVICE_MODE = [
  "not_running",
  "main_menu",
  "show",
  "protection",
  "sleep",
  "alarm",
] as const;
export type DeviceMode = (typeof DEVICE_MODE)[number];

export const DEVICE_MODE_LABELS: Record<DeviceMode, string> = {
  not_running: "Não rodando",
  main_menu: "Menu inicial",
  show: "Demonstração",
  protection: "Proteção",
  sleep: "Repouso",
  alarm: "Alarme",
};

/** Plataforma do dispositivo — agnóstico desde o dia 1 (iOS é trilha futura). */
export const DEVICE_PLATFORM = ["android", "ios"] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORM)[number];
