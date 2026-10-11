import { createTheme, responsiveFontSizes } from '@mui/material/styles'
import { sharedComponents, type Surface } from './sharedComponents'

// Mundanes — the light "corporate/boring" theme. White and light-gray
// surfaces, dark text, a single restrained slate-blue accent, plain
// system sans-serif type, and flat 1px gray borders with no keyline
// shadows. Deliberately the plainest theme in the app. Ported from Oghma
// and reshaped to Taliesin's theme conventions (stock palette keys,
// inline typography, the same component-override set as the other themes).
/**
 * The raised surface this theme is made of: panels, dialogs, cards, and the
 * tooltip, which is a card that floats. Declared once so they cannot drift.
 */
const surface: Surface = {
  backgroundImage: 'none',
  backgroundColor: '#ffffff',
  border: '1px solid rgba(0,0,0,0.12)',
  boxShadow: 'none'
}

const mundanesTheme = responsiveFontSizes(
  createTheme({
    palette: {
      mode: 'light',
      // HTOO-355: one step darker than Material blue. #1976d2 was 2.89:1 on the
      // grey page; this is 3.10:1 on the page, 4.95:1 on paper, and white is
      // 4.95:1 on it.
      primary: {
        main: '#1871c9',
        light: '#4a97e0',
        dark: '#115293',
        contrastText: '#ffffff'
      },
      // secondary is the title-bar / chrome color (TitleBar + NavToolbar paint
      // from secondary.main). Mundanes uses the classic Windows active-title
      // navy so the corporate look has a real anchor of color, and shares it
      // with Dubhaimid so both read as the same family.
      // NOTE: secondary.dark is deliberately *lighter* than main — NavToolbar's
      // active nav icon paints with secondary.dark, and on the navy bar it must
      // be bright to read (same inversion the Hybrasyl theme uses).
      secondary: {
        main: '#0a246a',
        light: '#2f4f8f',
        dark: '#7fb3ee',
        contrastText: '#ffffff'
      },
      background: {
        // A cool light-gray canvas so white paper/cards read as raised surfaces.
        default: '#c9cdd4',
        paper: '#ffffff'
      },
      text: {
        primary: '#1a1a1a',
        secondary: '#5f6368',
        disabled: '#9aa0a6',
        // Headings on the page and cards, the chrome icons and the toolbar caption.
        button: '#1a1a1a',
        // Text on a light fill: a chrome button on hover (info.main).
        dark: '#1a1a1a'
      },
      divider: 'rgba(0,0,0,0.12)',
      error: { main: '#d32f2f' },
      warning: { main: '#ed6c02' },
      info: { main: '#0288d1' },
      success: { main: '#2e7d32' }
    },

    typography: {
      fontFamily: 'Roboto, "Segoe UI", system-ui, -apple-system, sans-serif',
      h1: { fontWeight: 500 },
      h2: { fontWeight: 500 },
      h3: { fontWeight: 500 },
      h4: { fontWeight: 500 },
      h5: { fontWeight: 500 },
      h6: { fontWeight: 500 },
      button: { textTransform: 'none', fontWeight: 500 },
      body1: { fontSize: '0.95rem' },
      body2: { fontSize: '0.85rem' },
      subtitle1: { fontSize: '0.9rem' },
      subtitle2: { fontSize: '0.8rem' }
    },

    shape: { borderRadius: 6 },

    components: {
      ...sharedComponents(surface),
      MuiPaper: {
        styleOverrides: {
          root: surface
        }
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            border: '1px solid rgba(0,0,0,0.23)',
            color: '#1871c9',
            '&:hover': { backgroundColor: 'rgba(24,113,201,0.06)', borderColor: '#1871c9' }
          },
          contained: {
            backgroundColor: '#1871c9',
            color: '#ffffff',
            boxShadow: 'none',
            '&:hover': { backgroundColor: '#115293', boxShadow: 'none' }
          }
        }
      },
      // The AppBar is the app chrome (title bar + nav toolbar), which paints
      // navy from secondary.main — so its foreground is white, not the dark
      // body text. AppBar is used nowhere else, so this only affects chrome.
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: '#0a246a',
            backgroundImage: 'none',
            color: '#ffffff',
            borderBottom: '1px solid rgba(255,255,255,0.12)',
            boxShadow: 'none',
            // Chrome icons are IconButtons whose sx color is text.button, which
            // is dark in this theme. Force them white, and drop the dark keyline
            // stroke that otherwise greys white glyphs on the navy bar. Scoped
            // to the AppBar, which is only ever the app chrome. The active nav
            // icon out-specifies this (see NavToolbar activeBtnSx).
            '& .MuiIconButton-root': { color: '#ffffff' },
            '& .MuiIconButton-root svg': { stroke: 'transparent' },
            // text.button is dark (it heads the grey page and the white cards), so
            // the toolbar's caption, which also uses it, is forced white here.
            '& .MuiTypography-root': { color: '#ffffff' }
          }
        }
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: '#ffffff',
            borderRight: '1px solid rgba(0,0,0,0.12)'
          }
        }
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            color: '#5f6368',
            '&.Mui-selected': {
              backgroundColor: 'rgba(24,113,201,0.08)',
              borderLeft: '2px solid #1871c9',
              color: '#1871c9'
            },
            '&:hover': { backgroundColor: 'rgba(0,0,0,0.04)' }
          }
        }
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: '#ffffff',
            border: '1px solid rgba(0,0,0,0.12)',
            backgroundImage: 'none',
            boxShadow: '0 1px 3px rgba(0,0,0,0.10)',
            transition: 'border-color 0.2s, box-shadow 0.2s',
            '&:hover': { borderColor: 'rgba(0,0,0,0.24)', boxShadow: '0 2px 6px rgba(0,0,0,0.14)' }
          }
        }
      },
      MuiDivider: { styleOverrides: { root: { borderColor: 'rgba(0,0,0,0.12)' } } },
      MuiChip: {
        styleOverrides: {
          root: {
            border: '1px solid rgba(0,0,0,0.12)',
            // The tint is for a plain chip only. On `root` it beat MUI's own fill
            // for every colour, so a warning or a selected chip looked plain.
            '&.MuiChip-colorDefault': {
              backgroundColor: '#eceff1',
              color: '#455a64'
            },
            // HTOO-355: a selected chip (color="primary", filled) takes the accent
            // and its label, as MUI's own fill does, but keeps the accent on hover:
            // primary.dark under a dark label fails 4.5:1.
            '&.MuiChip-filled.MuiChip-colorPrimary': {
              backgroundColor: '#1871c9',
              color: '#ffffff',
              borderColor: '#1871c9',
              '&.MuiChip-clickable:hover': { backgroundColor: '#1871c9' }
            }
          }
        }
      },
      MuiTab: {
        styleOverrides: {
          root: {
            color: '#5f6368',
            '&.Mui-selected': { color: '#1871c9' }
          }
        }
      },
      MuiTabs: { styleOverrides: { indicator: { backgroundColor: '#1871c9' } } },
      MuiInputLabel: {
        styleOverrides: { root: { '&.Mui-focused': { color: '#1871c9' } } }
      },
      MuiCheckbox: {
        styleOverrides: {
          root: {
            color: 'rgba(0,0,0,0.4)',
            '&.Mui-checked': { color: '#1871c9' }
          }
        }
      },
      MuiSlider: {
        defaultProps: { color: 'secondary' },
        styleOverrides: {
          rail: { backgroundColor: 'rgba(0,0,0,0.2)', opacity: 1 }
        }
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.23)' },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.5)' },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#1871c9' }
          }
        }
      }
    }
  })
)

export default mundanesTheme
