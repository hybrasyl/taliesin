import { getLuminance, useTheme } from '@mui/material/styles'

/**
 * The engraved chrome: for a decorated theme whose bars carry dark text.
 *
 * The title bar and the nav bar outline their text and icons with a dark
 * keyline (a black text-shadow on the title, a dark stroke on the icons). That
 * outlines LIGHT text. Around dark text (danaan's #1a1008 on its gold bars,
 * grinneal's near-black on its tan ones) the keyline merges with the glyph and
 * doubles its edges. Those bars are engraved instead: a thin cream edge below and
 * right, as if cut into the bar. Ported from Mabon (WP96, 6c1b8a0).
 */
export const ENGRAVE = '1px 1px 0 rgba(255,248,232,0.75)'

/** True when `color` is dark text, which the keyline would smear. */
export const isDarkText = (color: string): boolean => getLuminance(color) < 0.18

/** True when the bars' text, `secondary.contrastText`, is dark in this theme. */
export function useEngraved(): boolean {
  return isDarkText(useTheme().palette.secondary.contrastText)
}

/** An engraved icon: no dark stroke, and the cream edge in place of the depth. */
export const ENGRAVED_ICON_SX = {
  '& svg': { fontSize: '1.4em', filter: `drop-shadow(${ENGRAVE})` }
} as const
