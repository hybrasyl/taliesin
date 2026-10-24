// The theme names. Pure TypeScript, with no electron or node import, so that
// main, the renderer and the vitest node project can all load it.
//
// The house modules (the six themes' index, the title bar and its chrome, the
// theme gallery) import `ThemeName` and `THEME_NAMES` from `@shared/types`. They
// are copied from the house template without an edit, so the names live here and
// `store/settingsStore.ts` re-exports them (HTOO-572).

export type ThemeName = 'hybrasyl' | 'chadul' | 'danaan' | 'grinneal' | 'mundanes' | 'dubhaimid'

export const THEME_NAMES: ThemeName[] = [
  'hybrasyl',
  'chadul',
  'danaan',
  'grinneal',
  'mundanes',
  'dubhaimid'
]
