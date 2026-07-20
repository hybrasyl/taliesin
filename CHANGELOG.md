# Changelog

All notable user-facing changes to Taliesin are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
[Semantic Versioning](https://semver.org/).

<!--
Release process (the notes are authored HERE, not edited on GitHub after the fact):
  1. As you land a PR, add its user-facing change under ## [Unreleased]
     (Added / Changed / Fixed / Removed / Deprecated / Security).
  2. To cut a release: rename ## [Unreleased] to ## [X.Y.Z] - YYYY-MM-DD, add a
     fresh empty ## [Unreleased] above it, and bump package.json to X.Y.Z
     (npm version X.Y.Z --no-git-tag-version).
  3. Tag vX.Y.Z and push. The release workflow runs scripts/changelog-extract.mjs
     to pull THIS version's section into the GitHub release body, then appends the
     auto-generated PR list below it.
Keep entries user-facing — internal refactors/tests show up in the appended auto list.

Sections for 1.0.0–2.6.0 were backfilled from the published GitHub releases after the fact
(this file postdates them), condensed to the format above. Those releases remain the verbose
record; where they disagree with this file, the git history was taken as authoritative.
-->

## [Unreleased]

### Added

- **Report an issue.** A bug-report affordance in the toolbar (and an About-card
  button) opens a dialog with an editable, privacy-scrubbed diagnostics block
  (app, version, OS, and recent errors — usernames, file paths, emails, and IPs
  are redacted). From there you can open a prefilled GitHub issue or copy the
  report to the clipboard. Uncaught errors are captured to rotating per-session
  log files, and a crash now shows a recoverable "Something went wrong" screen
  with a Report/Reload choice instead of a blank window. A **Reveal logs folder**
  button in the About card opens the log directory.
- **Join Maps.** The Map Maker can stitch a second map onto any side of the
  current one. Pick it from another open tab or browse for a `.map` on disk,
  choose left/top/bottom/right, and slide it along the seam (with start / center
  / end presets) while a live isometric preview — zoomable, pannable, and fitted
  to the window — ghosts the incoming map in place. Edges of different lengths
  are handled: the result is the union, with uncovered tiles left empty. The
  result can either be **saved as a new map** (the default, opening in a new tab
  and leaving both sources untouched) or **joined into the current map**, which
  keeps its file — in that case the map's existing warps are not rewritten and
  anything the join moved needs re-pointing.
- **Folder picker on save.** The map and world map editors now let you choose
  (or type) a subfolder to save into, next to the filename field. Renaming or
  regenerating a filename keeps the file in the folder it already lives in.

### Changed

- **The map and world map file lists group by folder.** A new toggle switches
  between the flat list and a collapsible folder tree; the choice is remembered
  between sessions.

### Fixed

- **World maps filed in subdirectories are no longer invisible.** The world map
  editor scanned only the top level of `worldmaps/`, so a world map in a
  subfolder was listed by the world index but absent from the editor. It now
  enumerates recursively, and archiving, restoring and renaming preserve the
  subfolder (including a template's `.meta.json` sidecar) instead of flattening
  everything to the type root.

- **Settings is now a grid of cards** instead of a tab strip. Each concern
  (Appearance, Libraries, Dark Ages Client, Installed Asset Packs, Companion App,
  Map Directories, Music Library, ffmpeg, .mus Encode Settings, Music Working
  Directories, Asset Packs, About) is its own card in a responsive grid, matching
  Creidhne. The theme selector is now a visual picker showing a live preview
  swatch of each theme rather than a dropdown.
- The **About** action moved from the toolbar into an About card in Settings.
  The card shows the app icon, version, and project links (modeled on
  oghma/mabon), with an "About Taliesin…" button and a **Reveal settings
  folder** button that opens `settings.json` in the OS file manager.

## [2.7.0] - 2026-07-16

### Added

- **Static Tile Manager**: a new top-level page for authoring `static_tiles`
  packs from ordinary artwork. Import loose PNGs, a tile grid, or a wang sheet;
  convert orthogonal source art to the client's 56×27 floor diamond (walls keep
  their source height); allocate floor/wall tile IDs; and commit straight into a
  pack. Includes true multi-file batch import with progress, per-cell
  orientation detection, a gallery of tiles already in the pack (click to
  re-target or delete), and pre-flight warnings that catch palette-cycled or
  frame-animated IDs — the client silently ignores pack art for those, so a
  no-op tile is flagged before you commit it. The wang mode adds a scheme picker
  (edge16 / corner16 / blob47), preset auto-fill, per-cell adjacency tagging,
  and an informational `wang_{terrain}.json` sidecar recording which minted
  tile IDs cover which masks.
- **Corporate themes**: two new plain-chrome themes — Mundanes (light) and
  Dubhaimid (dark) — selectable from Settings. On these themes the title bar
  swaps the gamified skull glyphs for flat MUI window controls.
- Town map asset packs (`town_maps` content type): full-panel town map
  replacement PNGs named by real server map ID (`town_00500.png`), authored at
  568×406 (or an integer multiple).

### Changed

- Title bar polish: the "Taliesin" wordmark and window/logo icons pick up a
  keyline outline and soft depth shadow (shared with the other house apps) for
  crisper contrast across themes.
- The world index now scans map subdirectories of `maps/` (and of `maps/.ignore/`)
  recursively, matching what the server loads, so subfoldered maps are catalogued
  and counted rather than silently skipped. The Map Editor lists them too, with
  rows showing the subfolder, so two maps sharing a filename across folders stay
  distinguishable.
- Archiving or unarchiving a map now mirrors its subfolder — `townmaps/x.xml`
  archives to `.ignore/townmaps/x.xml` and returns to where it came from,
  instead of being flattened onto the archive root (where two maps of the same
  name would silently collide and one would be renamed).

### Fixed

- Maps whose filename uses an uppercase extension (`Abel.XML`) are now catalogued
  in the world index. The server loads them — it globs `*.xml` through a
  case-insensitive filesystem — so they appeared in the Map Editor list but with
  no display name or ID, because the index they were looked up in had skipped
  them.
- The world index is no longer built twice when opening a library with a stale
  cache, and pages that read it now share one build instead of each starting
  their own.
- Archive Viewer: preview control rows (sprite frame navigation, tileset
  pagination, font/glyph selectors) no longer overflow off the bottom of the
  viewer pane.
- Windows taskbar / Task Manager now show the correct Taliesin app identity and
  icon (AppUserModelID aligned with the installer app ID).
- Title bar heading no longer grows on window resize across breakpoints.

## [2.6.0] - 2026-07-03

### Added

- **UI Layout Forge**: a WYSIWYG editor for authoring `ui_panels` client layouts.
  Render, select, drag, resize and snap controls on a visual canvas with a
  palette, live properties panel and full undo/redo; edit per-resolution variants
  in side-by-side tabs; attach control art from PNGs, installed asset packs or
  legacy `.dat` archives; browse bind targets in a variable catalog and wire
  controls to them; import existing legacy prefab control files; and compile
  straight to `ui_panels` packs (`schema_version 2`) with XML round-trip
  fidelity.
- Map editors consume installed `static_tiles` / `world_maps` packs directly.
- Music picker with pack-aware preview (track title / artist / album) and
  blob-URL playback under CSP.
- Splash window on boot; the main window reveals only once settings hydrate.

### Changed

- React 18 → 19, MUI v7 → v9, and state management moved from Recoil to Zustand.

### Fixed

- `BoardType` casing corrected to the authoritative `Messageboard`.

### Security

- Path-safety hardening: all library and music roots are whitelisted, and a
  missing `.ignore` directory is tolerated rather than failing the scan.
- Resolved all 11 outstanding npm audit advisories.

## [2.5.0] - 2026-06-29

### Added

- Authoring for the remaining six `.datf` content types — `music`,
  `sound_effects`, `world_maps`, `npc_portraits`, `static_tiles` and
  `creature_sprites` — reaching full parity with the Brigid client's registry.

### Changed

- Settings now live under `%LOCALAPPDATA%`, with an automatic migration from the
  previous roaming `%APPDATA%` location on first run.
- Bumped `@eriscorp/hybindex-ts` to 0.3.0.

## [2.4.1] - 2026-06-24

### Added

- Round-trip an existing `.datf` back into an editable pack (`pack:import`).
- Blob-URL asset previews and a namespace-grouped asset table in the pack editor.
- Per-kind dimension validation, the item-icon dye flow, and the UI-sprite panel.
- Archive Viewer auto-loads `khanpal.dat` as an auxiliary palette source.

### Changed

- Asset packs are now driven by a `packKinds` registry, so the create and edit UI
  are kind-agnostic and a new content type is data, not new screens.
- Release pipeline now produces signed and notarized builds for Windows, Linux
  and macOS.

### Fixed

- Map passability: corrected the SOTP byte interpretation (an off-by-one plus a
  low-nibble mask), so the collision overlay matches the client.
- Settings writes survive transient file locks (rename retry plus queue
  resilience in `settingsManager`).
- The palette test icon is copied into the pack directory instead of being stored
  as an absolute path that broke when the pack moved.

## [2.4.0] - 2026-04-26

### Added

- **Font Editor**: a top-level page for editing standalone Dark Ages 8×12 `.fnt`
  files. Per-glyph pixel editing in a magnified grid, two picker views (flat
  16-column grid, and grouped by Unicode block with placeholders), charset-aware
  labels showing codepoint and character or control-char mnemonic (NUL, DEL,
  NBSP, …), and an "Add glyph" dialog that surfaces filled vs. missing slots per
  block along with the padding cost of adding a glyph past the current end.

### Changed

- Input and checkbox overrides from the hybrasyl theme ported into the chadul,
  danaan and grinneal themes, for consistent form styling across all four.
- Bumped `@eriscorp/hybindex-ts` to 0.2.1 and dropped the local `WorldIndex` type
  mirror, so renderer types no longer drift from the package.

### Fixed

- Map XML Editor rendering regression after the hybindex-ts migration:
  `<world>/mapfiles` (a sibling of the approved `xml/` root) was rejected by the
  path-safety guard, so binary `.map` reads failed silently. The handler now
  blesses the world parent, and sibling subdirectories work without extra
  settings.

## [2.3.0] - 2026-04-25

### Added

- **Palettes & Duotone manager**: define named palettes (e.g. Elements — 17
  entries with shadow/highlight colour pairs), then duotone-colour any source PNG
  into per-entry variants via a four-stop luminance gradient. Per-icon
  calibration persists across sessions; an auto-detect heuristic picks the best of
  nine preset variants per source-entry pair, or parameters can be dialled by
  hand. Adds Palettes, Colorize and Batch tabs.
- Duotone batch processing across a folder of PNGs × every palette entry in one
  run, writing to `{packDir}/_colorized/` with a `manifest.json` mapping each
  (source, entry) to its output. A grayscale master cache makes reruns fast, and
  identical calibration yields byte-identical PNGs.
- Archive Browser overhaul: a dynamic `.dat` picker replaces the static chips,
  with previews for tileset / pcx / hea / fnt / bik / jpf. BIK videos play inline,
  transcoded to MP4 via ffmpeg and content-hash cached.
- Dynamic map lighting in the renderer.
- Music manager: expanded metadata view and Suno-prompt tooling (reads
  `TXXX:PROMPT` ID3 frames).

### Changed

- Dashboard refresh: Active Library, Current Client, Asset Packs and Index State
  are now uniform outlined cards in a four-column grid, each with an empty
  "Not configured" state. The Index State card carries its Build/Rebuild button
  inline.
- Music pack deploys skip the ffmpeg re-encode when the source mp3 already
  matches the deploy target.
- `MapData.music` is now optional, and the field formerly labelled "Enabled" is
  renamed "Map Enabled".
- README rewritten to reflect actual feature scope; added the GNU AGPL v3
  license.

### Fixed

- Settings (Asset Packs path, Companion path, Music Library, ffmpeg path, Music
  Working Dir) silently failed to save whenever any one of them was still unset —
  the IPC schema validator rejected `null` and threw before the disk write.
- Prefab previews render isometrically using real tile bitmaps instead of
  placeholder graphics.
- Music scanning tolerates a missing music library directory instead of failing.
- Music pack deploy validates its sources before clearing the destination, so a
  bad source can no longer wipe an existing deploy.
- XML parser errors are detected even when the `parsererror` element is the
  document root.
- The map renderer's asset cache is bounded, and tile bitmaps are scoped per
  client to prevent cross-client cache pollution.

### Security

- All save-side IPC handlers validate their payloads through Zod schemas.
  Failures are logged to `{userData}/ipc-validation.log` (rotated at 256KB) and
  rejected with a structured error.
- Path arguments to filesystem IPC handlers are gated by a session-scoped
  allowed-roots set — settings-derived roots plus paths explicitly blessed via an
  OS dialog that session — with an `assertInside` traversal guard on every
  path-taking handler. The renderer cannot reach files outside those roots.

## [2.2.0] - 2026-04-20

### Added

- **Multi-tab Map Editor**: open several maps at once, each tab keeping its own
  undo/redo history, selection and clipboard. Close via the X, middle-click or
  Ctrl+W, with an unsaved-changes prompt on dirty tabs. Tool settings (active
  tool, zoom, grid, layer visibility) stay global across tabs.
- **Procedural terrain generation** (experimental): generate terrain from the map
  editor toolbar or empty state. Tile families are auto-discovered from 5,500+
  real DA maps via offline adjacency analysis; pick primary and secondary ground
  families with noise-based region blending, optional wall-pair scattering,
  configurable noise parameters (scale, octaves, persistence, threshold) and
  seed-based reproducibility. Under active development — results will improve.
- Theme-aware custom scrollbars matching all four themes, updating instantly on
  theme switch via CSS custom properties.
- Release workflow notifies Discord after a successful build.

### Changed

- The tile picker now includes tile 0, and the sample tool scrolls the picker to
  the sampled tile.
- Undo/redo, map resize and directional resize all preserve scroll position and
  zoom (repaint without a canvas remount).
- Directional resize buttons repositioned to clear the scrollbar gutters.

### Fixed

- Ctrl+wheel and wheel tilt now scroll horizontally reliably (the wheel listener
  is registered non-passive).
- The canvas scroll container constrains properly and shows its scrollbars.

## [2.1.0] - 2026-04-19

### Added

- **Asset Pack Manager**: a page for creating and managing `.datf` asset packs
  (`ability_icons`, `nation_badges`) — pack CRUD, PNG asset management, and
  compile to `.datf`.
- Archive Viewer: Extract Raw (original bytes) and Export as PNG in the preview
  panel, plus an "Extract All" toolbar action to export a whole archive to a
  directory.
- Dashboard: library status with folder name and path, configured paths (DA
  client, asset packs), an index stats grid covering all 17 world-index
  categories, index rebuild with progress, and Recently Visited chip navigation.
- Launch Creidhne from the toolbar; companion app path configurable in Settings.

### Changed

- Settings reorganized into tabs: General, Libraries, Map Directories, Music,
  Asset Packs.
- Dashboard restyled to match Creidhne (overline labels, stat cards, outlined
  chips, dividers); the About dialog moved to a toolbar info icon.
- Removed the redundant Quick Actions dashboard section — the toolbar covers
  navigation.

### Fixed

- Version display reads from `package.json` instead of falling back to the
  Electron version.

## [2.0.0] - 2026-04-19

### Added

- **Legacy Archive Viewer**: browse `.dat` archives with format-aware previews
  for all DA asset types. Grouped, virtualized entry list collapsible by
  extension with quick-open buttons for known client archives; sprite preview
  (EPF/SPF/MPF/EFA/HPF) with palette picker and frame navigation/animation;
  palette grid, text/hex viewer, BMP display, `.mp3` playback, and name search.
- **Map Maker**: a full isometric binary `.map` editor. Create or open maps with
  three-layer editing (background, left/right foreground), ghost tile preview,
  a 100-deep undo/redo stack that batches drags, and save to DA-compatible
  binary.
  - Tools: draw, erase, sample, flood fill, line (with live Bresenham preview),
    shape (rect/circle, outlined or filled), rectangular select, and random fill
    from a multi-selection.
  - Selection: cut/copy/paste/delete, paste preview with ghost overlay and
    Shift+click repeat placement, drag to move or Shift+drag to duplicate, and
    red-tinted overwrite warnings.
  - Tile picker: virtualized grids for ground (`TILEA.BMP`) and foreground
    (`stc*.hpf`) tiles, Ctrl/Shift multi-select for random fill, hover preview
    for oversized foreground tiles, and layer toggles.
  - Prefabs: create from a selection, browse and stamp from a Map Maker sidebar,
    and manage in a dedicated Prefab Catalog page. Stored as JSON under
    `<library>/.creidhne/prefabs/`; zero-valued tiles don't overwrite on stamp.
  - Map operations: resize (with shrink warning), directional resize from any
    edge, split into 2×1 / 1×2 / 2×2 sub-maps with an isometric cut preview, and
    PNG export at 25–400% with optional transparency and collision wireframe.
  - Viewport: zoom (slider or Shift+wheel), Ctrl+wheel horizontal scroll,
    middle-drag panning, grid overlay, layer visibility and passability overlays
    from `sotp.dat`, animated tile playback, a draggable collision-map popup, a
    right-click context menu, a status bar, and a shortcut reference panel.

### Changed

- The world index builder moved from an inline implementation to the shared
  `@eriscorp/hybindex-ts` package (v0.2.0).
- `FOREGROUND_PAD` changed from 480 to 512 to match ChaosAssetManager, which may
  slightly shift the vertical positioning of rendered maps.
- Music Manager loads significantly faster — ID3/Vorbis tags are read lazily
  instead of all upfront — and files can now be removed from the library.

### Fixed

- The worldmap master file is editable again, along with assorted world map
  rendering and interaction fixes.

### Removed

- The `sprites` page, replaced by `mapmaker`. Saved settings pointing at it fall
  back to the catalog page.

## [1.0.0] - 2026-04-11

### Added

- Initial release: project setup, settings (modelled on Creidhne), map viewer,
  map XML editor, and world map editor.
