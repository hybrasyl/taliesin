// house module: title-bar v1 — change it in the template, then port
import { GiContract, GiExpand, GiDeathSkull } from 'react-icons/gi'
import RemoveIcon from '@mui/icons-material/Remove'
import CropSquareIcon from '@mui/icons-material/CropSquare'
import CloseIcon from '@mui/icons-material/Close'
import type { ThemeName } from '@shared/types'

/**
 * The title bar's chrome: the shadows, glyphs and colours of the wordmark and
 * the window buttons, for each kind of chrome. `TitleBar` draws the bar with
 * these, and the theme gallery draws its bar previews with them, so a person
 * reviews the chrome that ships (HTOO-572).
 *
 * - `plain` (mundanes, dubhaimid): MUI icons, flat, no shadow.
 * - `keyline` (the six decorated themes): light bar text with a #000 outline
 *   and a soft depth shadow. Every decorated bar is dark, with light text, so
 *   the keyline always outlines light text. danaan and grinneal had light bars
 *   with dark text, which needed an engrave of their own (Sabrael, 2026-10-23).
 */
export type ChromeKind = 'plain' | 'keyline'

/**
 * The corporate themes. Their bar is flat: MUI icons, no keyline, no shadow.
 * The list is here, not in `shared/`, so that the house module imports no
 * app alias and its JS edition runs as it is (`house-js/`).
 */
export const PLAIN_CHROME_THEMES: readonly ThemeName[] = ['mundanes', 'dubhaimid']

export function chromeKind(theme: ThemeName): ChromeKind {
  return PLAIN_CHROME_THEMES.includes(theme) ? 'plain' : 'keyline'
}

const KEYLINE = ['1px 1px 0 #000', '-1px -1px 0 #000', '1px -1px 0 #000', '-1px 1px 0 #000']
const DEPTH = '0 2px 3px rgba(0,0,0,0.55)'

/** The wordmark is real text, so text-shadow paints each layer at full strength. */
export const TITLE_SHADOW: Record<ChromeKind, string> = {
  plain: 'none',
  keyline: [...KEYLINE, DEPTH].join(', ')
}

/** The app icon takes the wordmark's lift. The plain themes drop it. */
export const LOGO_FILTER: Record<ChromeKind, string> = {
  plain: 'none',
  keyline: `drop-shadow(${DEPTH})`
}

/**
 * SVG glyphs cannot take text-shadow. The keyline is a solid stroke and the
 * depth ONE drop-shadow: chained drop-shadows compound, and the depth layer
 * washed out.
 */
const GLYPH: Record<ChromeKind, object> = {
  plain: { '& svg': { fontSize: '1.15em' } },
  keyline: {
    '& svg': { fontSize: '1.4em', stroke: '#000', strokeWidth: 11, filter: `drop-shadow(${DEPTH})` }
  }
}

/** A window button's colours, as palette paths or CSS colours. */
export interface ButtonColours {
  color: string
  hoverBackground: string
  hoverColor: string
}

/**
 * The plain bar is navy, so its hover is a translucent white wash (a dark
 * action.hover is invisible on navy). The decorated bars hover to info.main,
 * with info.contrastText on it. That was text.dark, which cannot read on a dark
 * info.main (danaan's, now that its status colours read as text on the page).
 */
export const BUTTON: Record<ChromeKind, ButtonColours> = {
  plain: {
    color: 'secondary.contrastText',
    hoverBackground: 'rgba(255,255,255,0.16)',
    hoverColor: 'secondary.contrastText'
  },
  keyline: {
    color: 'secondary.contrastText',
    hoverBackground: 'info.main',
    hoverColor: 'info.contrastText'
  }
}

/**
 * The close button hovers to the error colour in every kind. The decorated
 * bars drew the skull in warning.main on info.main: yellow on cyan, about 1.1:1
 * in each DA theme. error.contrastText is held to 4.5:1 on error.main.
 */
export const CLOSE: Pick<ButtonColours, 'hoverBackground' | 'hoverColor'> = {
  hoverBackground: 'error.main',
  hoverColor: 'error.contrastText'
}

/**
 * The `sx` of a window button. `hovered` draws the hover state at rest, for the
 * gallery, because a person cannot hover three buttons at once.
 */
export function windowButtonSx(kind: ChromeKind, close = false, hovered = false): object {
  const c = close ? { ...BUTTON[kind], ...CLOSE } : BUTTON[kind]
  const hover = { backgroundColor: c.hoverBackground, color: c.hoverColor }
  return {
    WebkitAppRegion: 'no-drag',
    ...GLYPH[kind],
    ...(hovered ? hover : { color: c.color, '&:hover': hover })
  }
}

/**
 * The current page on a nav bar: a row of icon buttons on `tertiary.main`,
 * under the title bar (creidhne, epona, balor, taliesin). Each app drew its own
 * mark, and each failed on a dark bar: `secondary.dark` or `warning.main` on
 * the bar was 1.1:1 to 1.5:1 (HTOO-572). The current button keeps the bar's
 * text colour, on a light wash, with a ring inside its edge in that colour. A
 * ring fits a round button and a square one.
 */
export const CURRENT = {
  background: 'rgba(255,255,255,0.12)',
  ring: 'inset 0 0 0 1.5px currentColor'
} as const

/**
 * The `sx` of a nav-bar button, with an app's own icon (an MUI icon, not a
 * window glyph). `current` marks the page that shows. `hovered` draws the hover
 * at rest, for the gallery.
 */
export function navButtonSx(kind: ChromeKind, current = false, hovered = false): object {
  const c = BUTTON[kind]
  const hover = { backgroundColor: c.hoverBackground, color: c.hoverColor }
  return {
    WebkitAppRegion: 'no-drag',
    ...(current ? { backgroundColor: CURRENT.background, boxShadow: CURRENT.ring } : {}),
    ...(hovered ? hover : { color: c.color, '&:hover': hover })
  }
}

/** The window glyphs: MUI icons on the plain bar, game glyphs on the others. */
export const GLYPHS = {
  minimize: { plain: RemoveIcon, decorated: GiContract },
  maximize: { plain: CropSquareIcon, decorated: GiExpand },
  close: { plain: CloseIcon, decorated: GiDeathSkull }
} as const
