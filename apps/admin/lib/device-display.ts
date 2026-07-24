/**
 * Como o modelo aparece na tela. Fica num lugar só porque já divergiu uma vez:
 * a lista mostrava "—" enquanto o detalhe mostrava o modelo detectado.
 */
export function modelLabel(
  catalogName: string | null | undefined,
  hardwareModel: string | null | undefined,
  detectedWord: string,
): string {
  if (catalogName && catalogName !== "—") return catalogName;
  if (hardwareModel) return `${hardwareModel} (${detectedWord})`;
  return "—";
}
