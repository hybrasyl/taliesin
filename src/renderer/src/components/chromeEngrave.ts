import { getLuminance, useTheme } from '@mui/material/styles'
import { useSettingsStore, PLAIN_CHROME_THEMES } from '../store/settingsStore'

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

/**
 * True when the bars are engraved: a decorated theme (not plain chrome) whose
 * bar text, `secondary.contrastText`, is dark. One rule for both bars.
 */
export function useEngraved(): boolean {
  const themeName = useSettingsStore((s) => s.theme)
  const barText = useTheme().palette.secondary.contrastText
  return !PLAIN_CHROME_THEMES.includes(themeName) && isDarkText(barText)
}

/**
 * The engraved form of a chrome button style: its icon keeps its own size and
 * loses the dark stroke, and the cream edge replaces the depth shadow.
 */
export function engraveIcons<T extends { '& svg': object }>(sx: T): T {
  return {
    ...sx,
    '& svg': { ...sx['& svg'], stroke: 'none', filter: `drop-shadow(${ENGRAVE})` }
  }
}
