import type { Components, Theme } from '@mui/material/styles'

/** The style keys of a card that the tooltip takes. */
interface Card {
  backgroundImage?: string
  backgroundColor?: string
  border?: string
  backdropFilter?: string
  boxShadow?: string
}

/**
 * The component overrides that Taliesin adds to each of the eight house themes.
 * The template does not have them. Each theme file is the template's file, plus
 * one spread of this object in its `components`, after the template's
 * `...filledControls`. Keep them in this one file, so that the next port of the
 * template's palettes is a copy of the eight theme files and the spread line. Do
 * not set `MuiButtonBase` or `MuiAlert` here: that key replaces the one in
 * `filledControls`, and `palette.test.ts` fails.
 *
 * - `MuiTooltip`: a tooltip is one of the theme's cards (#73). Taliesin's file
 *   lists put a tooltip on each row, and the longest of them is a file path.
 *   MUI's default tooltip is a grey slab with white text in all eight themes, and
 *   matches none of them. This one takes the ground, the edge and the bevel of
 *   the theme's own `MuiPaper`, and the theme's text colour. A card that sits
 *   inline can have no shadow; a floating card needs one, so a flat theme's
 *   tooltip takes the theme's elevation 6. A theme whose paper sets no ground
 *   (mundanes) gives the tooltip `background.paper`. The tooltip has no arrow,
 *   because a card has none. It is 440px wide, not MUI's 300, so that a file
 *   path wraps once at most.
 *
 * The overrides do not fill with `primary.main`, so the palette tests are not
 * affected. `taliesinOverrides.test.ts` makes sure that each theme carries them.
 *
 * The old shared overrides also had a `MuiSlider` that drew each slider in
 * `secondary` with a fixed rail. It is gone: `secondary` is the bar colour, a
 * fill for the bars only, and `primary.main` now reads on the page and on paper
 * in every theme (HTOO-572).
 */
export const taliesinOverrides: Components<Omit<Theme, 'components'>> = {
  MuiTooltip: {
    styleOverrides: {
      tooltip: ({ theme }) => {
        // MUI gives a style callback the whole theme. Its type here leaves out
        // `components`, because this object is part of `components`.
        const card = ((theme as Theme).components?.MuiPaper?.styleOverrides?.root ?? {}) as Card
        const shadow = card.boxShadow && card.boxShadow !== 'none' ? card.boxShadow : undefined
        return {
          backgroundImage: card.backgroundImage ?? 'none',
          backgroundColor: card.backgroundColor ?? theme.palette.background.paper,
          border: card.border ?? `1px solid ${theme.palette.divider}`,
          backdropFilter: card.backdropFilter,
          boxShadow: shadow ?? theme.shadows[6],
          color: theme.palette.text.primary,
          borderRadius: Number(theme.shape.borderRadius),
          padding: theme.spacing(0.75, 1.25),
          fontSize: theme.typography.pxToRem(12),
          fontWeight: 400,
          maxWidth: 440
        }
      }
    }
  }
}
