/** Estados e plataformas de um dispositivo da frota (ARQUITETURA §4). */
export const DEVICE_STATUS = ["provisioning", "online", "degraded", "offline"] as const;
export type DeviceStatus = (typeof DEVICE_STATUS)[number];

export const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  provisioning: "Provisionando",
  online: "No ar",
  degraded: "Instável",
  offline: "Fora do ar",
};

/** Plataforma do dispositivo — agnóstico desde o dia 1 (iOS é trilha futura). */
export const DEVICE_PLATFORM = ["android", "ios"] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORM)[number];
