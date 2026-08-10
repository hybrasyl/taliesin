# WP1 — Auto-resolve palettes in the Archive Viewer

**Size: S.** Depends on WP0 and on dalib-ts **3.1.0**. **Shipped 2026-07-31** against dalib-ts 3.1.0, on `main`.

**Depends on:** [WP0](00-dalib-ts-3-bump.md). Read `../00-overview.md` first.

## Goal

Taliesin used to show a legacy sprite in the wrong colours until the user guessed a palette. `ArchivePreview.tsx` listed every `.pal` in the archive and defaulted to `names[0]` — the first palette in archive order, which is almost never right. This WP seeds the dropdown with the palette the rules resolve, so the viewer tells the truth about what is in a `.dat` with no user action.

## Decisions (Sabrael, 2026-07-28)

1. **The palette dropdown stays.** Auto-resolution seeds it. Selecting a different palette by hand keeps working exactly as it did.
2. **Build against the local dalib-ts checkout — do not wait for the npm publish.** Publishing 3.1.0 after Taliesin has exercised it is the point: this is the integration test.

## Contract

The specification is the document repo's `docs/architecture/palette-resolution.md`. Taliesin consumes the resolver; it does not implement the rules.

```ts
new PaletteResolver(archiveName, archive, provider).resolve(entry, frameIndex?)
  // → { palette, paletteNumber, luminanceBlended, kind, ruleId } | null
```

It never throws and caches every palette source — including failed builds — for the life of the instance, so **one resolver is constructed per open archive and kept**, rather than one per preview.

## File map

- `src/renderer/src/pages/ArchivePage.tsx` — `auxArchives` became the resolver's `ArchiveProvider`. It previously loaded one sibling (`khanpal.dat`); the rules also need `legend.dat` for `national.dat`, `misc.dat` and khan pants. A missing sibling stays non-fatal.
- `src/renderer/src/components/archive/ArchivePreview.tsx` — calls the resolver on entry change and preselects the result. The `<Select>` is now a manual override, and the returned `ruleId` is shown beside it so a wrong rule can be reported.
- `src/renderer/src/utils/archiveRenderer.ts` — `renderEntry` accepts the resolved palette. The `.epf` branch no longer returns null merely because the caller guessed nothing.

`mapRenderer.ts` needed no change.

## Non-goals (stop-lines)

- **No palette rule layer in Taliesin.** It lives in dalib-ts. A rule that fires wrongly is a dalib-ts fix and a correction to the document repo's spec. Recorded in `../00a-backlog.md`.

## Notes for the next person — developing against a local dalib-ts

Kept because the next WP gated on an unreleased dalib-ts will need it. Four things about `npm link` that otherwise cost an afternoon:

1. **`npm link` does not touch `package.json`.** That is the reason to prefer it over a `file:` dependency — there is no bad version spec to accidentally commit. It also means **the manifest lies for the duration**. A WP built this way does not merge until the dependency is published and the manifest says so.
2. **The link points at `dist/`, not `src/`.** Re-run `npm run build` in dalib-ts after every change there, or Taliesin keeps compiling against the previous build.
3. **Any `npm install` or `npm ci` in Taliesin silently drops the link.** The symptom is a confusing "X is not exported" at a point where nothing you changed touches the import. Check with `node -e "console.log(require('fs').realpathSync('node_modules/@eriscorp/dalib-ts'))"`.
4. **CI has no link,** so such a WP fails CI until the dependency publishes. That is expected, not a defect.

Before publishing, verify the _packaged_ artifact rather than the symlink: `npm pack` in dalib-ts and install the tarball into Taliesin once. A symlink reads the working tree, so it cannot catch a `files`/`exports` mistake that would ship a broken tarball.

## Acceptance criteria

1. `legend.dat`, `setoa.dat`, a `khan*.dat` and `roh.dat` open with sprites in correct colours and no user action.
2. The dropdown still changes the palette.
3. An entry with no matching rule falls back to the previous behaviour rather than showing nothing.
4. The rule that fired is named in the UI.
5. All checks green.
