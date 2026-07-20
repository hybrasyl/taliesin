/** Largest map dimension the editor will produce, on either axis. */
export const MAX_MAP_DIM = 512

/** Clamp a numeric text-field value to a valid map dimension (1–512, default 1). */
export function clampMapDim(value: string): number {
  return Math.max(1, Math.min(MAX_MAP_DIM, parseInt(value) || 1))
}
