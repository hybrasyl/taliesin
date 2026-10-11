import { createTheme, responsiveFontSizes } from '@mui/material/styles'
import { sharedComponents, type Surface } from './sharedComponents'

// Dubhaimid — the dark "corporate/boring" theme. Neutral charcoal grays
// (VS Code-ish), light-gray text, a single muted blue accent, plain system
// sans-serif type, and flat subtle borders with no keyline shadows. The
// dark sibling of Mundanes. Ported from Oghma and reshaped to Taliesin's
// theme conventions (stock palette keys, inline typography, the same
// component-override set as the other themes).
/**
 * The raised surface this theme is made of: panels, dialogs, cards, and the
 * tooltip, which is a card that floats. Declared once so they cannot drift.
 */
const surface: Surface = {
  backgroundImage: 'none',
  backgroundColor: '#252526',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: 'none'
}

const dubhaimidTheme = responsiveFontSizes(
  createTheme({
    palette: {
      mode: 'dark',
      // HTOO-355: a deeper blue. White on #5c8bc4 was 3.53:1; this is 3.62:1 on
      // the page, 3.32:1 on paper, and white is 4.61:1 on it.
      primary: {
        main: '#4277b7',
        light: '#82a9d6',
        dark: '#3f6a9e',
        contrastText: '#ffffff'
      },
      // secondary is the title-bar / chrome color (TitleBar paints from
      // secondary.main). Dubhaimid shares Mundanes' classic Windows
      // active-title navy so both corporate themes read as the same family,
      // just light vs dark.
      secondary: {
        main: '#0a246a',
        light: '#2f4f8f',
        dark: '#061a4f',
        contrastText: '#ffffff'
      },
      background: {
        default: '#1e1e1e',
        paper: '#252526'
      },
      text: {
        primary: '#e0e0e0',
        secondary: '#9aa0a6',
        disabled: '#6a6a6e',
        // Headings on the page and cards, the chrome icons and the toolbar caption.
        button: '#ffffff',
        // Text on a light fill: a chrome button on hover (info.main).
        dark: '#1a1a1b'
      },
      divider: 'rgba(255,255,255,0.12)',
      error: { main: '#f44336' },
      warning: { main: '#ffa726' },
      info: { main: '#29b6f6' },
      success: { main: '#66bb6a' }
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
            border: '1px solid rgba(255,255,255,0.23)',
            color: '#4277b7',
            '&:hover': { backgroundColor: 'rgba(66,119,183,0.12)', borderColor: '#4277b7' }
          },
          contained: {
            backgroundColor: '#4277b7',
            color: '#ffffff',
            boxShadow: 'none',
            '&:hover': { backgroundColor: '#3f6a9e', boxShadow: 'none' }
          }
        }
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: '#252526',
            backgroundImage: 'none',
            borderBottom: '1px solid rgba(255,255,255,0.12)',
            boxShadow: 'none'
          }
        }
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: '#252526',
            borderRight: '1px solid rgba(255,255,255,0.12)'
          }
        }
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            color: '#9aa0a6',
            '&.Mui-selected': {
              backgroundColor: 'rgba(66,119,183,0.16)',
              borderLeft: '2px solid #4277b7',
              color: '#82a9d6'
            },
            '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)' }
          }
        }
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: '#2d2d30',
            border: '1px solid rgba(255,255,255,0.12)',
            backgroundImage: 'none',
            transition: 'border-color 0.2s',
            '&:hover': { borderColor: 'rgba(255,255,255,0.24)' }
          }
        }
      },
      MuiDivider: { styleOverrides: { root: { borderColor: 'rgba(255,255,255,0.12)' } } },
      MuiChip: {
        styleOverrides: {
          root: {
            border: '1px solid rgba(255,255,255,0.12)',
            // The tint is for a plain chip only. On `root` it beat MUI's own fill
            // for every colour, so a warning or a selected chip looked plain.
            '&.MuiChip-colorDefault': {
              backgroundColor: '#3e3e42',
              color: '#c4c8cc'
            },
            // HTOO-355: a selected chip (color="primary", filled) takes the accent
            // and its label, as MUI's own fill does, but keeps the accent on hover:
            // primary.dark under a dark label fails 4.5:1.
            '&.MuiChip-filled.MuiChip-colorPrimary': {
              backgroundColor: '#4277b7',
              color: '#ffffff',
              borderColor: '#4277b7',
              '&.MuiChip-clickable:hover': { backgroundColor: '#4277b7' }
            }
          }
        }
      },
      MuiTab: {
        styleOverrides: {
          root: {
            color: '#9aa0a6',
            '&.Mui-selected': { color: '#82a9d6' }
          }
        }
      },
      MuiTabs: { styleOverrides: { indicator: { backgroundColor: '#4277b7' } } },
      MuiInputLabel: {
        styleOverrides: { root: { '&.Mui-focused': { color: '#4277b7' } } }
      },
      MuiCheckbox: {
        styleOverrides: {
          root: {
            color: 'rgba(255,255,255,0.4)',
            '&.Mui-checked': { color: '#4277b7' }
          }
        }
      },
      MuiSlider: {
        defaultProps: { color: 'secondary' },
        styleOverrides: {
          rail: { backgroundColor: 'rgba(255,255,255,0.2)', opacity: 1 }
        }
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.23)' },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.5)' },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#4277b7' }
          }
        }
      }
    }
  })
)

export default dubhaimidTheme
