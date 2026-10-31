// Module augmentation for the extended palette keys used by the four
// shared themes. The website's themes (the canonical source) are plain
// JS so they accept arbitrary keys; in TS we have to teach MUI's types
// about them or every theme file produces type errors.
//
// This file has no runtime exports — it exists only to extend the
// '@mui/material/styles' module. As long as it's included in the
// renderer's tsconfig (it is, via src/renderer/src/**/*), the
// augmentation is in scope everywhere.

declare module '@mui/material/styles' {
  interface TypeBackground {
    /** Same as `default` — kept for parity with sibling repos that read it. */
    gray: string
    /** Slightly darker than `paper` — for nested surfaces. */
    paperMedium: string
    /** Slightly lighter than `paper` — for hover states / panels. */
    paperLight: string
    /** Much darker than `paper` — for dialog scrims, scrollbar tracks. */
    paperDark: string
    /** Light surface for table rows / data rows. */
    tableLight: string
    /** Dark surface for alternating table rows. */
    tableDark: string
    /** Light border for table cells / dividers. */
    tableBorderL: string
    /** Heavy border for table boundaries. */
    tableBorderD: string
    /** Scrollbar thumb (resting). */
    scrollbarDark: string
    /** Scrollbar thumb (hover). */
    scrollbarLight: string
  }

  interface TypeText {
    /** Headline accent — used by hero text, CircularProgress, etc. */
    headline: string
    /** Resting link color. */
    link: string
    /** Hovered link color. */
    linkHover: string
    /** Visited link color. */
    visited: string
    /** Headings on the page and on cards (4.5:1 on both, palette.test.ts). The
     *  bars use `secondary.contrastText` instead: one token cannot read on both
     *  a light page and a dark bar (mundanes), or the reverse (HTOO-572). */
    button: string
    /** Dark text on a light fill. Not on `info.main`: the chrome hover takes
     *  `info.contrastText`, because a light theme's info colour is dark (HTOO-572). */
    dark: string
  }

  /** The nav bar under the title bar. It is a fill only, as `secondary` is:
   *  `contrastText` is `secondary.contrastText` (tertiary.test.ts). */
  interface Palette {
    tertiary: Palette['primary']
  }

  interface PaletteOptions {
    tertiary?: PaletteOptions['primary']
  }
}

// Empty export to keep this a module rather than a global script.
export {}
