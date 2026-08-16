/**
 * How much to magnify a preview so it fits the space it is given.
 *
 * An imported source is any size the author drew it. A fixed magnification is
 * safe for a 28×42 wall face and wrong for a 512×512 drawing: the canvas backing
 * store becomes 2560×2560 and the preview fills the screen.
 *
 * Small art still magnifies by a whole number of pixels, so a tile-sized source
 * stays crisp. Art larger than the box is reduced by whatever fraction makes it
 * fit — a fractional shrink is what the box needs, and the canvas draws it with
 * smoothing off, so it reads as the art rather than as a blur.
 */

/** The most a preview magnifies, however small the art is. */
export const PREVIEW_MAX_UPSCALE = 5

/** The scale at which a `width`×`height` image fits a `box`×`box` square. */
export function previewScale(width: number, height: number, box: number): number {
  if (!(width > 0) || !(height > 0) || !(box > 0)) return 1
  const fit = Math.min(box / width, box / height)
  if (fit < 1) return fit
  return Math.max(1, Math.min(PREVIEW_MAX_UPSCALE, Math.floor(fit)))
}
