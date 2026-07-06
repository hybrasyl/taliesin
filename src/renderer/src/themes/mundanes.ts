import { createTheme, responsiveFontSizes } from '@mui/material/styles'

// Mundanes — the light "corporate/boring" theme. White and light-gray
// surfaces, dark text, a single restrained slate-blue accent, plain
// system sans-serif type, and flat 1px gray borders with no keyline
// shadows. Deliberately the plainest theme in the app. Ported from Oghma
// and reshaped to Taliesin's theme conventions (stock palette keys,
// inline typography, the same component-override set as the other themes).
const mundanesTheme = responsiveFontSizes(
  createTheme({
    palette: {
      mode: 'light',
      primary: {
        main: '#1976d2',
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
        disabled: '#9aa0a6'
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
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: '#ffffff',
            border: '1px solid rgba(0,0,0,0.12)',
            boxShadow: 'none'
          }
        }
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            border: '1px solid rgba(0,0,0,0.23)',
            color: '#1976d2',
            '&:hover': { backgroundColor: 'rgba(25,118,210,0.06)', borderColor: '#1976d2' }
          },
          contained: {
            backgroundColor: '#1976d2',
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
            // Chrome icons are IconButtons whose sx color (text.button) is
            // undefined, so without this they fall back to MUI's default
            // action.active grey. Force them white, and drop the dark keyline
            // stroke that otherwise greys white glyphs on the navy bar. Scoped
            // to the AppBar, which is only ever the app chrome. The active nav
            // icon out-specifies this (see NavToolbar activeBtnSx).
            '& .MuiIconButton-root': { color: '#ffffff' },
            '& .MuiIconButton-root svg': { stroke: 'transparent' }
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
              backgroundColor: 'rgba(25,118,210,0.08)',
              borderLeft: '2px solid #1976d2',
              color: '#1976d2'
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
            backgroundColor: '#eceff1',
            color: '#455a64',
            border: '1px solid rgba(0,0,0,0.12)'
          }
        }
      },
      MuiTab: {
        styleOverrides: {
          root: {
            color: '#5f6368',
            '&.Mui-selected': { color: '#1976d2' }
          }
        }
      },
      MuiTabs: { styleOverrides: { indicator: { backgroundColor: '#1976d2' } } },
      MuiInputLabel: {
        styleOverrides: { root: { '&.Mui-focused': { color: '#1976d2' } } }
      },
      MuiCheckbox: {
        styleOverrides: {
          root: {
            color: 'rgba(0,0,0,0.4)',
            '&.Mui-checked': { color: '#1976d2' }
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
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#1976d2' }
          }
        }
      }
    }
  })
)

export default mundanesTheme
