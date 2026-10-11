// Module augmentation for the two extra text keys that Taliesin's components read.
//
// Headings use `color: 'text.button'`, and the chrome's hover uses
// `color: 'text.dark'`. MUI's `sx` passes a palette path that a theme does not
// define through as a literal string. That string is not a colour, so the
// browser drops it and the text takes its parent's colour. Each theme sets both
// keys, and the palette test fails when a theme does not, or sets one that is
// not legible. MUI's palette options are Partial, so the compiler does not
// catch an omitted key; this file only makes the keys known to TypeScript.
//
// The template's augmentation (hyb-electron-template, themes/augmentation.ts)
// declares more keys. These are the two that Taliesin uses.
//
// No runtime exports: the file only extends '@mui/material/styles', and the
// renderer's tsconfig includes it through src/renderer/src/**/*.

declare module '@mui/material/styles' {
  interface TypeText {
    /** Headings on the page and on cards. The bars use secondary.contrastText. */
    button: string
    /** Dark text on a light fill, such as a chrome button on hover (`info.main`). */
    dark: string
  }
}

export {}
