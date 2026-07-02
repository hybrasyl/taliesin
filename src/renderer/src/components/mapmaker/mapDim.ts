/** Clamp a numeric text-field value to a valid map dimension (1–512, default 1). */
export function clampMapDim(value: string): number {
  return Math.max(1, Math.min(512, parseInt(value) || 1))
}
