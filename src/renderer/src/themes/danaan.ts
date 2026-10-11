import { createTheme, responsiveFontSizes } from '@mui/material/styles'
import { sharedComponents, type Surface } from './sharedComponents'

/**
 * The raised surface this theme is made of: panels, dialogs, cards, and the
 * tooltip, which is a card that floats. Declared once so they cannot drift.
 */
const surface: Surface = {
  backgroundImage: 'none',
  backgroundColor: 'rgba(250,242,220,0.94)',
  border: '1px solid rgba(159,126,36,0.45)',
  backdropFilter: 'blur(2px)',
  boxShadow: '-2px -2px 0 0 #9f7e24, 2px 2px 0 0 #9f7e24'
}

const danaanTheme = responsiveFontSizes(
  createTheme({
    palette: {
      mode: 'light',
      // HTOO-355: an older gold. #b8922a was 2.39:1 on the parchment; this is
      // 3.13:1 on the page, 3.41:1 on paper, and the label is 4.89:1 on it.
      // The values are Mabon's (WP96), picked from a preview of the controls.
      primary: {
        main: '#9f7e24',
        light: '#e8c060',
        dark: '#7a5e18',
        contrastText: '#1a1008'
      },
      secondary: {
        main: '#c8a030',
        light: '#f0d070',
        dark: '#8a6820',
        contrastText: '#1a1008'
      },
      background: {
        default: '#f5e8c0',
        paper: 'rgba(250,242,220,0.94)'
      },
      text: {
        primary: '#2a1e08',
        secondary: '#4a3c20',
        disabled: '#9a8860',
        // Headings on the page and on cards. (The bars use secondary.contrastText.)
        button: '#2a1e08',
        // Text on a light fill: a chrome button on hover (info.main).
        dark: '#1a1008'
      },
      divider: 'rgba(159,126,36,0.3)',
      error: { main: '#ff0000' },
      warning: { main: '#FFFF00' },
      info: { main: '#6de7f7' },
      success: { main: '#38ff4f' }
    },

    typography: {
      fontFamily: '"Crimson Pro", Georgia, serif',
      h1: {
        fontFamily: '"Cinzel Decorative", serif',
        letterSpacing: '0.22em',
        fontWeight: 400,
        color: '#2a1e08'
      },
      h2: {
        fontFamily: '"Cinzel", serif',
        letterSpacing: '0.08em',
        fontWeight: 400,
        color: '#2a1e08'
      },
      h3: {
        fontFamily: '"Cinzel", serif',
        letterSpacing: '0.06em',
        fontWeight: 400,
        color: '#2a1e08'
      },
      h4: {
        fontFamily: '"Cinzel", serif',
        letterSpacing: '0.06em',
        fontWeight: 400,
        color: '#2a1e08'
      },
      h5: {
        fontFamily: '"Cinzel", serif',
        letterSpacing: '0.06em',
        fontWeight: 400,
        color: '#2a1e08'
      },
      h6: {
        fontFamily: '"Cinzel", serif',
        letterSpacing: '0.06em',
        fontWeight: 400,
        color: '#2a1e08'
      },
      button: {
        fontFamily: '"Cinzel", serif',
        letterSpacing: '0.12em',
        textTransform: 'uppercase'
      },
      caption: { fontFamily: '"Cinzel", serif', letterSpacing: '0.18em', fontSize: '0.7rem' }
    },

    shape: { borderRadius: 2 },

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
            borderRadius: 2,
            border: '1px solid #9f7e24',
            color: '#7a5e18',
            '&:hover': { backgroundColor: 'rgba(159,126,36,0.12)', borderColor: '#e8c060' }
          },
          contained: {
            backgroundColor: '#9f7e24',
            // HTOO-355: the palette's contrastText (4.89:1); the cream was 2.76:1.
            color: '#1a1008',
            '&:hover': { backgroundColor: '#d4a843' }
          }
        }
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: 'rgba(255,248,225,0.97)',
            backgroundImage: 'none',
            borderBottom: '1px solid rgba(159,126,36,0.3)',
            boxShadow: 'none',
            color: '#2a1e08'
          }
        }
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: 'rgba(250,242,220,0.97)',
            borderRight: '1px solid rgba(159,126,36,0.4)'
          }
        }
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            fontFamily: '"Cinzel", serif',
            fontSize: '0.7rem',
            letterSpacing: '0.1em',
            color: '#4a3c20',
            borderBottom: '1px solid rgba(159,126,36,0.12)',
            '&.Mui-selected': {
              backgroundColor: 'rgba(159,126,36,0.15)',
              borderLeft: '2px solid #9f7e24',
              color: '#7a5e18'
            },
            '&:hover': { backgroundColor: 'rgba(159,126,36,0.1)', paddingLeft: '20px' }
          }
        }
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: 'rgba(255,250,235,0.96)',
            border: '1px solid rgba(159,126,36,0.25)',
            backgroundImage: 'none',
            transition: 'border-color 0.2s, transform 0.2s',
            '&:hover': { borderColor: '#9f7e24', transform: 'translateY(-2px)' }
          }
        }
      },
      MuiDivider: { styleOverrides: { root: { borderColor: 'rgba(159,126,36,0.2)' } } },
      MuiChip: {
        styleOverrides: {
          root: {
            fontFamily: '"Cinzel", serif',
            fontSize: '0.65rem',
            letterSpacing: '0.1em',
            border: '1px solid rgba(159,126,36,0.35)',
            // The tint is for a plain chip only. On `root` it beat MUI's own fill
            // for every colour, so a warning or a selected chip looked plain.
            '&.MuiChip-colorDefault': {
              backgroundColor: 'rgba(159,126,36,0.15)',
              color: '#7a5e18'
            },
            // HTOO-355: a selected chip (color="primary", filled) takes the accent
            // and its label, as MUI's own fill does, but keeps the accent on hover:
            // primary.dark under a dark label fails 4.5:1.
            '&.MuiChip-filled.MuiChip-colorPrimary': {
              backgroundColor: '#9f7e24',
              color: '#1a1008',
              borderColor: '#9f7e24',
              '&.MuiChip-clickable:hover': { backgroundColor: '#9f7e24' }
            }
          }
        }
      },
      MuiTab: {
        styleOverrides: {
          root: {
            fontFamily: '"Cinzel", serif',
            fontSize: '0.7rem',
            letterSpacing: '0.14em',
            color: '#9a8860',
            '&.Mui-selected': { color: '#7a5e18' }
          }
        }
      },
      MuiTabs: { styleOverrides: { indicator: { backgroundColor: '#9f7e24' } } },
      MuiInputLabel: {
        styleOverrides: { root: { '&.Mui-focused': { color: '#9f7e24' } } }
      },
      MuiCheckbox: {
        styleOverrides: {
          root: {
            color: 'rgba(159,126,36,0.5)',
            '&.Mui-checked': { color: '#9f7e24' }
          }
        }
      },
      MuiSlider: {
        defaultProps: { color: 'secondary' },
        styleOverrides: {
          rail: { backgroundColor: 'rgba(240,230,204,0.25)', opacity: 1 }
        }
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(159,126,36,0.3)' },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(159,126,36,0.6)' },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#9f7e24' }
          }
        }
      }
    }
  })
)

export default danaanTheme
