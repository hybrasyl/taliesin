// Module augmentation for the two extra text keys Taliesin's components read.
//
// Taliesin used `color: 'text.button'` (headings, the music panels, the chrome
// icons) and `color: 'text.dark'` (the chrome hover) for a long time with
// neither key in any palette. MUI's `sx` resolves an unknown palette path to the
// literal string, which is not a colour, so the browser dropped it: headings
// inherited their parent's colour, and the chrome icons fell back to
// `action.active`. This declares the keys so a theme may set them (MUI's palette
// options are Partial, so a theme that omits one still compiles); the palette
// test fails when a theme omits either or sets one that is not legible.
//
// The template's augmentation (hyb-electron-template, themes/augmentation.ts)
// declares more keys. These are the two Taliesin uses.
//
// No runtime exports: it only extends '@mui/material/styles', and the
// renderer's tsconfig includes it through src/renderer/src/**/*.

declare module '@mui/material/styles' {
  interface TypeText {
    /** Headings on the page and on cards, and the chrome's icons and caption. */
    button: string
    /** Dark text on a light fill, such as a chrome button on hover (`info.main`). */
    dark: string
  }
}

export {}
