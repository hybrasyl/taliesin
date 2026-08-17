import type { Components, Theme } from '@mui/material/styles'

/**
 * Component overrides every theme carries.
 *
 * Each of the six themes builds its own `components` block, because each styles
 * its own chrome. This holds the overrides that must not differ between them —
 * where the right answer is "wear the theme", not "pick a colour".
 */

/**
 * The look of a raised surface: what a panel, a dialog and a card are made of.
 *
 * Every theme already declares one of these for `MuiPaper`. Naming it makes it
 * something other components can be built from, so a new floating thing is the
 * theme's own card rather than a fresh guess at what a card looks like.
 */
export interface Surface {
  backgroundImage?: string
  backgroundColor: string
  border: string
  backdropFilter?: string
  /** `'none'` is allowed: a flat corporate card sits inline and needs no lift. */
  boxShadow: string
}

/**
 * A tooltip is one of the app's cards, not a browser artefact.
 *
 * MUI's default is a grey-800 slab with white text and no border — identical in
 * all six themes and matching none of them. Taking `surface` instead means the
 * tooltip wears the same ground, edge and bevel as the panel it appears over,
 * and a theme added later gets its own card free.
 *
 * The one place it departs from the card: a card that sits inline can have no
 * shadow, and a floating card cannot — with nothing to lift it, it reads as a
 * hole in the page. Where the surface is flat, the theme's own elevation is
 * used instead.
 *
 * No arrow. A card does not have one, and the bevel these themes draw is a hard
 * two-pixel frame that a triangle breaks.
 */
export function sharedComponents(surface: Surface): Components<Theme> {
  return {
    MuiTooltip: {
      styleOverrides: {
        tooltip: ({ theme }) => ({
          ...surface,
          boxShadow: surface.boxShadow === 'none' ? theme.shadows[6] : surface.boxShadow,
          color: theme.palette.text.primary,
          borderRadius: Number(theme.shape.borderRadius),
          padding: theme.spacing(0.75, 1.25),
          fontSize: theme.typography.pxToRem(12),
          fontWeight: 400,
          // Wider than MUI's 300, because the longest thing a tooltip in this
          // app carries is a file path, and wrapping one twice is worse than
          // one wide card.
          maxWidth: 440
        })
      }
    }
  }
}
