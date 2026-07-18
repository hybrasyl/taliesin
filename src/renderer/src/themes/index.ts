import type { Theme } from '@mui/material'
import type { ThemeName } from '../store/settingsStore'
import '@fontsource/cinzel'
import '@fontsource/cinzel-decorative'
import '@fontsource/crimson-pro'

import hybrasylTheme from './hybrasyl'
import chadulTheme from './chadul'
import danaanTheme from './danaan'
import grinnealTheme from './grinneal'
import mundanesTheme from './mundanes'
import dubhaimidTheme from './dubhaimid'

export { hybrasylTheme, chadulTheme, danaanTheme, grinnealTheme, mundanesTheme, dubhaimidTheme }

// name → MUI theme, so the ThemePicker can paint each preview card in that
// theme's own palette (mirrors the map App.tsx feeds to ThemeProvider).
export const themesByName: Record<ThemeName, Theme> = {
  hybrasyl: hybrasylTheme,
  chadul: chadulTheme,
  danaan: danaanTheme,
  grinneal: grinnealTheme,
  mundanes: mundanesTheme,
  dubhaimid: dubhaimidTheme
}
