import type { Components, Theme } from '@mui/material/styles'

/**
 * Component overrides every theme carries.
 *
 * Each of the six themes builds its own `components` block, because each styles
 * its own chrome. This holds the overrides that must not differ between them —
 * where the right answer is "read it from the theme", not "pick a colour".
 *
 * The callback form (`({ theme }) => …`) is what makes that work: one
 * declaration resolves against whichever palette is active, so a theme that is
 * added later inherits it with no edit here.
 */

/**
 * A tooltip is a surface of the app, not a browser artefact.
 *
 * MUI's default is a grey-800 slab with white text, which is the same in all
 * six themes and looks like none of them. It also carries no border, so against
 * a dark page it reads as a floating shadow rather than a panel.
 *
 * This paints it from the palette: paper for the ground, `text.primary` for the
 * words, `divider` for the edge — the same three tokens every other panel in
 * the app uses. The padding is deliberately tight and symmetric. A tooltip is
 * read in a moment, and space around the words is the first thing that makes it
 * feel like a dialog instead.
 */
export const sharedComponents: Components<Theme> = {
  MuiTooltip: {
    defaultProps: {
      arrow: true
    },
    styleOverrides: {
      tooltip: ({ theme }) => ({
        backgroundColor: theme.palette.background.paper,
        color: theme.palette.text.primary,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: Number(theme.shape.borderRadius),
        boxShadow: theme.shadows[6],
        padding: theme.spacing(0.5, 1),
        fontSize: theme.typography.pxToRem(12),
        fontWeight: 400
      }),
      arrow: ({ theme }) => ({
        color: theme.palette.background.paper,
        '&::before': {
          border: `1px solid ${theme.palette.divider}`
        }
      })
    }
  }
}
