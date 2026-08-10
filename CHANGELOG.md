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

- **Ambient sound packs.** A new asset pack type for looping background beds — wind, rain, a river,
  a busy market — separate from sound effects, because a bed plays continuously underneath
  everything else rather than firing once. Add audio files and compile. Each sound gets a number
  that a map refers to. Beds loop by default; tick **One-shot** on any that must play once and stop.

### Changed

- **Opening Taliesin twice now brings the open window forward** instead of starting a second copy.
  Two copies shared one settings file and the last one to save won, so a preference changed in one
  window could disappear without a word when the other saved.
- **Taliesin now runs properly over Remote Desktop.** A remote session has no graphics card, so the
  app switches itself to software drawing and turns off the themes' background blur — the most
  expensive thing to draw without one. Dragging the window and idle CPU both improve; nothing
  changes on a local machine. There is no setting, because the choice has to be made before the app
  finishes starting. Windows does not update `%SESSIONNAME%` when you reconnect to a session that
  was already open, so set `TALIESIN_DISABLE_GPU=1` if that is you — see the README.
- The world index cache is rebuilt once on first run after this release, and the vendor directory
  on Linux is now `Erisco` to match every other Erisco application. Nothing is lost: the cache is
  derived from the world data and is rebuilt from it.

### Security

- **The content policy is applied to the page before it loads, not partway through**, and the
  startup splash is covered by it too — it previously had no policy at all. Nothing about the app
  changes visibly.
- **Each release build now proves the shipped binary really has its debug hatches switched off.**
  This was a manual check on one platform; it is automatic on all three, macOS included, where the
  application holds one set of settings per processor type and only one of them used to be read.

### Fixed

- **Sprites in the archive viewer get their palette on Linux and macOS.** The official installer
  writes `Legend.dat` while the palette rules ask for `legend.dat`, so on a case-sensitive
  filesystem the sibling archive was never found and khan, national and misc sprites fell back to
  the manual palette picker. Taliesin now reads the real name off the directory, and the underlying
  library (DALib 3.1.1) matches sibling names case-insensitively too. Windows was never affected.
- **A corrupt palette table no longer hangs the archive viewer.** A damaged `.tbl` could ask for
  billions of palette entries and be given them. Bad lines are now dropped and the rest of the file
  still loads (DALib 3.1.1), which changes nothing for the 331 palette tables a stock client ships.
- **Warp destinations with an `&` in the name resolve again.** The world index recorded map names
  without decoding XML entities, so `The Crow & Cask` reached the warp destination picker as
  `The Crow &amp; Cask`. Picking it wrote a doubly-escaped name into the map file and the warp
  went nowhere. The index now decodes the name it scrapes, and the picker offers the real one.
- **Duplicate map names are visible instead of silent.** The server indexes maps by name, so two
  maps that share one name are a live fault. The world index now records the collisions it finds.
- **Weapon damage reads the paired tags and a zero minimum.** The index scrape dropped both, so
  affected weapons showed no damage where they have some.
- **Maps saved by Taliesin load on the server again.** Every map the editor wrote was rejected,
  for two separate reasons and either one alone was enough. The root element lost its namespace,
  which the server refuses outright — and because the map reader strips namespaces on the way in,
  opening a valid map and saving it with no changes was enough to break it. Signs were also
  written with a type the server has no name for, so a map with any sign failed even once the
  namespace was right. The sign type is now `Sign`, which is what the server calls it, and the
  editor no longer offers the invalid one.
- **Archiving a map now takes it out of service.** Archive copied the file into `.ignore/` and
  left the original in place, so the map you archived was still live and still served — while the
  interface reported success and showed it under Archived. It also appeared in both lists at once,
  which was the only visible sign. Unarchive had the same fault in reverse, and so did the world
  map editor's Move to Templates and Move to Active. All four now move the file instead of copying
  it, so it exists in exactly one place at every instant.
- **Renaming a map renames it.** A rename used to leave three files behind: the new one, a copy
  filed under `.ignore/`, and the original still sitting in `maps/`. Two of those were live and
  carried the same `Id`, which the server indexes on — and the message said only that the old file
  "remains (manual delete may be needed)", which reads as optional. A rename now moves the file, so
  one map ends up at the new name and nothing is left to tidy up. Renaming onto a name that already
  exists is refused and changes nothing on disk. The world map editor is fixed the same way.
- **The Determine Map Dimensions dialog stops growing.** Stepping through candidate sizes made the
  dialog taller on every step, without bound — it never settled and never came back down. The
  preview asked for a scale that fit the box, but worked it out from a slightly shorter map than
  the one actually drawn, so each render came back taller than the box it had just measured. The
  box grew, and the next step measured the larger box. The preview is now a fixed size and the
  scale comes from the renderer itself, so the same map size always draws the same picture.
- **Stepping quickly through sizes no longer smears two previews together.** A slow render kept
  drawing into the preview after the next one had started.
- **On the Hybrasyl theme, the selected control is the one that stands out again.** Its accent
  colour was the same value as the page background, so anything marking itself active — a selected
  chip, a toggled tool, the "Active" library tag — painted itself the colour of the page and
  disappeared. The effect was backwards rather than merely faint: the unselected items were the
  visible ones. The accent is now a legible blue. The other five themes were checked and none had
  the same fault.
- **Taliesin draws its own icon on Linux.** The application menu and taskbar showed the macOS
  artwork instead — a different picture, drawn to a different platform's conventions. The Linux
  build now installs the full standard set of icon sizes from the artwork meant for it, and
  identifies its window so the desktop can match it to the installed entry. Windows and macOS are
  unchanged.
- **Ground tiles in the map editor look like they do in the Archive Viewer.** The map drew empty
  parts of a ground tile as see-through holes while the tileset preview drew a solid diamond, so
  the same tile looked like two different things depending on where you opened it. The map now
  matches the preview. Walls are pixel-for-pixel unchanged.

### Security

- **Electron updated to 41.10.4.** This is the runtime the application ships, and the update
  closes seven advisories against it. Two are rated high: a context-isolation bypass, and a
  custom-protocol cross-origin read. Four build-time and test-time packages were updated in the
  same pass; those never shipped to you.

## [2.9.0] - 2026-08-01

### Added

- **The Archive Viewer picks the right palette by itself.** Opening a sprite, tile sheet or
  foreground tile no longer starts on whichever palette happened to sort first — it starts on the
  one the client would use, worked out from the archive and entry name. The picker is still there
  and still switches palettes by hand; it now begins on the correct answer and names the rule it
  used, so a wrong guess is reportable. Tile sheets resolve **per tile**, which a single palette
  never could. Entries with no matching rule say so instead of showing something plausible and
  wrong.
- **The client's real font is browsable.** `.lft` entries — `da.lft` and `lod.lft`, both inside
  `national.dat` — used to show as a hex dump, which is the one thing a font is not. They now open
  as a font: a header summary, every glyph that actually carries a bitmap, and any one glyph's
  pixels and metrics on demand. There is also a box where you type a string and see it drawn in the
  client's own font at its real spacing, which is what tells you whether a label will fit. Glyphs
  are labelled by key, never by character name: a key is a raw byte value, and what it means depends
  on the code page the client had selected. Reading only — Taliesin does not write `.lft`.
- **Table files say what they are.** A `.tbl` entry in the Archive Viewer used to be a wall of
  numbers unless it happened to be a dye table. Palette tables, palette cycling tables, tile
  animation tables and effect tables now show as a named table with real columns — which ids map to
  which palette, which palette indices cycle and how often, which tiles animate in what order and at
  what interval, and which frames make up each effect. The viewer states how it identified the file,
  so a wrong answer is reportable, and a `.tbl` it cannot identify still shows as plain text.
- **What's new.** Settings → About has a **What's new?** button that shows the release notes for
  the version you are running. The notes ship inside the app, so the dialog needs no network and
  always matches the build you have rather than whatever is newest.

### Changed

- **macOS gets its own app icon.** The Mac build no longer reuses the shared logo. It now ships
  artwork drawn to Apple's conventions — a full-bleed rounded square with properly transparent
  corners, so it sits correctly in the Dock and the Finder next to every other app. Windows and
  Linux are unchanged.
- **Reveal logs folder moved out of Settings.** The button is gone from the About card; the logs
  are still one click away from **Report an issue**, which is where you need them. Its old slot
  now holds **What's new?**.
- **The download is smaller and carries only what the app runs.** The packaged build was also
  shipping the project's own documentation, test suite, scripts and tool configuration alongside
  the program. Packaging now lists what belongs rather than what does not, so nothing internal
  travels with a release. The logo artwork is stored at the sizes it is actually drawn at instead
  of at full master resolution, which also makes the splash appear sooner.

### Removed

- **The Font Editor is gone.** It authored 8×12 `.fnt` glyph files, which nothing consumes: Dark
  Ages does not read `.fnt` for its own text, and the Brigid client uses TrueType fonts. The page
  therefore offered edits that could never reach a client, which was misleading. Reading `.fnt`
  entries is unaffected — the Archive Viewer still previews them, so legacy fonts inside `.dat`
  archives remain inspectable.

### Security

- **Links can only open a browser.** Taliesin previously handed any URL a page asked to open
  straight to the operating system. That is more than a browser handoff — Windows will act on
  `file:`, on a network share, and on whatever else has registered a handler on the machine.
  Only `http`, `https` and `mailto` are now passed on; anything else is refused rather than
  guessed at. The links in About and Settings are unaffected.
- **The window can no longer be navigated away from the app.** Any attempt to load a page that
  is not Taliesin's own is refused, and a safe address is handed to your browser instead of
  being silently dropped. No page can open a second window.
- **The app checks where its own internal messages come from.** Every request the interface makes
  of the file system is now accepted only from Taliesin's real window. This closes a gap rather
  than fixing an observed problem — there is no known way it was reachable.
- **The interface runs in a sandbox,** and the shipped build no longer honours the developer
  switches that let an Electron program be used as a general-purpose script runner.

### Fixed

- **The splash screen behaves on every boot.** It could fail to appear at all, appear for a
  fraction of a second, or — if startup failed — be left floating on top of everything with no
  way to close it, since it has no taskbar entry. It now always appears, always stays up long
  enough to read, and always goes away.
- **The portable build no longer opens with a blank pause.** The portable `.exe` unpacks itself to
  a temporary folder before the app exists, and that stretch showed nothing at all — several
  seconds in which a double-click appeared to have done nothing. It now shows the same artwork the
  app opens with, so the unpack and the launch read as one boot rather than two.
- **The dev build no longer freezes on large Dark Ages files.** Switching archives, editing a map,
  or opening the Static Tile Manager could stall the window or exhaust its memory. React's
  development-only render profiler was inspecting the game binaries held in component state, one
  row per byte. That profiler is now off by default when running from source (set
  `VITE_REACT_PERF_TRACK=1` to turn it back on), and the Archive page keeps its archive out of
  reach of it regardless. **Packaged builds were never affected.**
- **Legacy asset decoding is more faithful across the board** (`@eriscorp/dalib-ts` 2.2.0 → 3.1.0).
  Tileset previews no longer punch holes where a tile uses palette index 0, and no longer show
  stray padding bytes as garbage outside the isometric diamond. SPF sprite previews honour each
  frame's placement and row pitch instead of ignoring them. The darkness overlay masks its run
  intensity correctly. Imported UI prefabs no longer gain invented frames. Maps with tile IDs
  above 32767, or with trailing bytes after the tile data, now load instead of failing.
- **Derived world map groups link to the reference set again.** Sidecars written before the
  canonical set was renamed still pointed at `MasterMapSet.xml`; opening such a group failed to
  read it and silently dropped the link — no "Derived from…" chip, no Sync from Reference, and
  exclusions did nothing. The old name now resolves to `ReferenceMapSet.xml` and the sidecar is
  corrected the next time it is saved.
- **Filename, ↺ and folder picker line up in every editor.** The map XML editor's filename hint
  (a map's computed name rarely matches its file's) was pushing the controls beside it out of
  alignment; the hint now sits on its own line below them.

## [2.8.0] - 2026-07-20

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

### Fixed

- **Leaving an editor with unsaved changes now asks first.** Every editor
  published its unsaved state for the toolbar to check, but nothing ever
  checked it — switching pages silently discarded unsaved map, world map, font
  and UI panel edits. Navigation now raises the same Save / Discard / Cancel
  prompt that switching files within a page already did, and a failed save keeps
  you where you are instead of navigating anyway.
- **The Map Maker no longer loses your open maps when you switch pages.** Tabs,
  their undo history and their unsaved edits now survive navigation. Previously
  a single toolbar click destroyed every open tab — including maps that only
  ever existed in memory (new, generated, split or joined), which were
  unrecoverable, while reopening a saved one meant going back through the
  dimension picker. Open maps are now held for the session, so closing tabs is
  what frees them.
- **World maps filed in subdirectories are no longer invisible.** The world map
  editor scanned only the top level of `worldmaps/`, so a world map in a
  subfolder was listed by the world index but absent from the editor. It now
  enumerates recursively, and archiving, restoring and renaming preserve the
  subfolder (including a template's `.meta.json` sidecar) instead of flattening
  everything to the type root.
- **Font glyph previews decode correctly.** The archive preview hand-unpacked
  glyph bits against a comment claiming the format was LSB-first; it now uses
  dalib-ts's `getGlyphPixels()`, which is canonically MSB-first. Also picks up
  that release's ColorTable out-of-memory guard, MPF variable-length header fix
  and CRC-32 finalXor correction.

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
