# Taliesin

A desktop viewer and editor for [Dark Ages](https://www.darkages.com) client assets and [Hybrasyl](https://www.hybrasyl.com) world map data. Companion to [Creidhne](https://github.com/hybrasyl/creidhne), which handles the broader range of Hybrasyl XML content.

Built with Electron + React + MUI.

## Creidhne integration

Taliesin and Creidhne share one world index, built by `@eriscorp/hybindex-ts`. Point both apps at the same world library folder in Settings and the index stays in sync automatically — map names, NPC lists, and other cross-references are available in both tools without a separate build step.

The index is derived and rebuildable, so it lives in per-machine local storage (`%LOCALAPPDATA%\Erisco\hybindex\`) rather than in the git-tracked world folder. Both apps land on the same cache because its key is derived from the world's own path; builds are incremental, so whichever app opens the world second usually finds the work already done.

> For far too long, previous members of the dev team maintained that a tool like this could not exist due to the complexity of the underlying XML structures. Recent advances in machine learning and latent space navigation have shown this to be demonstrably false.

## Features

| Feature               | Status      |
| --------------------- | ----------- |
| Dashboard             | ✅ Complete |
| Map Catalog           | ✅ Complete |
| Map XML Editor        | ✅ Complete |
| Map Maker             | ✅ Complete |
| World Map Editor      | ✅ Complete |
| Music Manager         | ✅ Complete |
| Sound Effects Browser | ✅ Complete |
| Archive Browser       | ✅ Complete |
| Prefab Catalog        | ✅ Complete |
| Asset Pack Manager    | ✅ Complete |
| Static Tile Manager   | ✅ Complete |
| UI Layout Forge       | ✅ Complete |
| Palette & Duotone     | ✅ Complete |
| Settings              | ✅ Complete |

### Dashboard

Landing page that surfaces active library and client paths, world library index statistics (maps, NPCs, creatures, etc.), recent page history, and quick-navigation links to frequently-used pages. Hosts the index build/rebuild controls and status display.

### Map Catalog

Scan a directory of DA client `.map` files and build a browsable catalog. Each map is rendered to a thumbnail via dalib-ts and stored with metadata — dimensions, description, source tag, custom tags, and notes — in a sidecar `catalog.json`. Sort and filter by tag, dimensions, or source. Generate a minimal Hybrasyl Map XML stub from any catalog entry to open directly in the Map XML Editor.

### Map XML Editor

Load, edit, and save Hybrasyl Map XML files alongside the rendered client map. Covers core fields (Id, Name, Description, dimensions, Music, flags) and sub-editors for Warps, NPCs, Reactors, Signs, and SpawnGroups. Objects are placeable and draggable on the map canvas. Syncs with the Hybrasyl world library folder configured in Settings. Includes an unsaved changes guard.

### Map Maker

Tile-painting editor for DA `.map` binary files with full new-map creation and round-trip back to the Map Catalog. Multi-tab editing with unsaved-changes guard, 100-level undo/redo, copy/cut/paste clipboard, and rectangle selection (move and duplicate). Drawing tools include brush, eraser, line, filled and outlined shapes, flood fill, and random fill. Layer controls for background, left/right foreground, and walkability visualization. Zoom 25%–200%, grid toggle, animation preview, collision popup, drag-handle resize with directional add/remove, export to PNG, split large maps, and parameter-driven procedural generation. Save selections as prefabs and stamp existing prefabs back into any map.

### World Map Editor

Load and edit Hybrasyl WorldMap XML with a visual overlay on the client world map image. Points appear as draggable pins; click to edit name, target map, coordinates, and access restrictions. Supports a **master set** plus **derived groups** model for world maps that show different subsets of locations depending on where the player enters:

- `worldmaps/.ignore/MasterMapSet.xml` — canonical set of all locations and their canvas positions
- Each derived group XML has a sidecar `.meta.json` recording which master points are excluded
- Opening a derived group shows active points and a collapsible **Excluded** list; deleting a point moves it to excluded rather than removing it permanently
- **Sync from Master** replaces the group's points with master-minus-exclusions
- **Link to Master** (one-time migration) computes the exclusion list automatically from an existing group file

### Music Manager

Manage a local audio library of DA music tracks. The **Library** tab scans a configured directory for audio files and provides metadata editing (display name, music ID) and in-app playback. The **Packs** tab organizes tracks into named packs with drag-reorder, music ID assignment, and ffmpeg-based encoding and deployment to client working directories. The **Client View** tab browses music entries directly from DA client archives.

### Sound Effects Browser

Browse and play DA client sound effects sourced directly from `legend.dat`. Entries are listed by numeric ID with in-row play/stop controls. A detail panel allows annotating each sound with a friendly name and comment, saved to `world/sfx-index.json` in the world library repository. Filter by ID, filename, or annotated name.

### Archive Browser

Inspect entries in DA client `.dat` archive files (read-only). Lists all entries grouped by extension with name and size, supports filter-by-name, and previews several formats: sprite and tile images (.epf, .mpf, .hpf, .spf) with **automatic palette resolution** and a manual palette override, tileset images (.tsi), PCX images, the **LFT glyph browser** (the client's live font format — browse populated glyphs and render sample strings), **typed `.tbl` views** (palette mapping, tile animation, effect and palette-cycling tables render as structured tables rather than raw text; `color0.tbl` still shows dye swatches), terrain animation tables (.hea), font metadata (.fnt), JPF inspection, and BIK video playback (transcoded to MP4 on demand). A quick-open dropdown enumerates all `.dat` files under the configured client folder, including subdirectories. Supports extracting individual entries or the full archive to disk. Repacking and writing back to legacy `.dat` archives is intentionally out of scope — new content ships via the Asset Pack Manager (`.datf`) instead.

### Prefab Catalog

Browse and manage reusable map tile patterns saved from the Map Maker. Each prefab is a width × height block of tiles stored as JSON in the active world library. Supports filter-by-name, isometric preview rendered with real client tile bitmaps, rename, and delete. Prefabs are stamped back into a map via the Prefab sidebar in the Map Maker.

### Settings

Configure the DA client install path (used to locate archives), the Hybrasyl world library path (shared with Creidhne), the music library and working directories, ffmpeg path, asset pack directory, and the application theme. Settings are persisted across sessions.

Taliesin finds Creidhne on its own — beside itself first, then from the installed application — on Windows, macOS and Linux. Settings shows where it was resolved from and offers Change, Clear override and Test Launch; picking a path manually is an override for unusual installs, not a requirement.

### Asset Pack Manager

Create, edit and **compile** modern Hybrasyl Client `.datf` asset packs — ZIP archives of PNG or audio assets plus a JSON manifest. Fourteen content types are supported: ability icons, nation badges, legend mark icons, item icons, UI sprite overrides, music, sound effects, ambient sounds, world maps, town maps, NPC portraits, static tiles, creature sprites and UI panels. Each kind knows its own filename convention, dimension rule and `covers` contract, so the editor adapts rather than needing per-type screens.

Packs are authored as a project directory, compiled to a `.datf` the client can load, and can be imported back from a compiled pack for further editing. Requires a pack working directory configured in Settings.

### Static Tile Manager

Author `static_tiles` packs from ordinary artwork rather than hand-built sheets. Import loose PNGs, a tile grid, or a wang sheet; convert orthogonal source art to the client's 56×27 floor diamond (walls keep their source height); allocate floor and wall tile IDs; and commit straight into a pack. Includes multi-file batch import with progress, per-cell orientation detection, a gallery of tiles already in the pack (click to re-target or delete), and pre-flight warnings that catch palette-cycled or frame-animated tile IDs — those are drawn by the legacy renderer and would visually overwrite a pack PNG.

### UI Layout Forge

A WYSIWYG editor for authoring `ui_panels` client layouts. Render, select, drag, resize and snap controls on a visual canvas with a palette, live properties panel and full undo/redo; edit per-resolution variants in side-by-side tabs; attach control art from PNGs, installed asset packs or legacy `.dat` archives; browse bind targets in a variable catalog and wire controls to them; import existing legacy prefab control files; and compile straight to `ui_panels` packs (`schema_version` 2) with XML round-trip. When a layout needs a variable the server does not expose, the Forge writes a design spec into the project's `specs/` directory rather than letting an author invent a binding path.

### Palette & Duotone

Define named color palettes and generate element-colored variants of grayscale icon assets via a duotone algorithm. The **Palettes** tab lists all palettes and per-entry color editors (shadow + highlight pickers, dark/light factor sliders). The **Colorize** tab renders a grid of variants for a chosen icon × palette entry, with an auto-detection heuristic surfacing the highest-quality variant. Calibration choices are persisted alongside the palette. Full scope is in [`docs/plans/complete/taliesin_duotone_scope.md`](docs/plans/complete/taliesin_duotone_scope.md).

### Planned Features

**Better Procedural Map Generation** — the current Map Maker generator works against vanilla DA tiles only. A richer generator that draws from custom asset packs (themed tile sets, prefab biomes, terrain palettes) is now unblocked, since `static_tiles` packs already replace tile art per ID.

**The remaining `.datf` content types** — `effects`, `projectiles`, `display_sprites`, `aisling_body`, `bundle`, `fonts`, `cutscenes` and `skeletal_animations` are scoped in the format spec but have no authoring path here yet. The pack-kind system is data-driven, so adding one is a new module plus three registrations rather than new editor screens.

## Installation

Pre-built releases for Windows are available on the [releases page](../../releases).

## Remote Desktop

Over Remote Desktop there is no GPU, so Taliesin drops to software rendering on its own and
suppresses the themes' backdrop blur, which is the most expensive thing to draw without one. There
is no setting: the choice has to be made before the app finishes starting, and the app adapts rather
than asking.

Detection reads `%SESSIONNAME%`, which Windows writes at logon and **never revises**. So if you
reconnect over RDP to a session that was already open at the console, every process still reports
`Console` and Taliesin will not notice. Set `TALIESIN_DISABLE_GPU=1` in that case.

The variable answers in both directions, and is the only override there is:

| Value          | Effect                                                   |
| -------------- | -------------------------------------------------------- |
| unset or empty | decide by detection                                      |
| `0`            | force hardware acceleration on, even in a remote session |
| anything else  | force software rendering, even on a local machine        |

`TALIESIN_DISABLE_GPU=1` on a local machine is also how the remote-session behaviour is reproduced
without a remote machine.

## Building from source

```bash
npm install
npm run dev          # development
npm run build:win    # Windows installer
```

Node.js 18+ required; development is done on Node 24.

## Project structure

| Path                           | Purpose                                                 |
| ------------------------------ | ------------------------------------------------------- |
| `src/main/`                    | Electron main process — IPC handlers, file I/O          |
| `src/preload/`                 | Preload bridge exposing `window.api`                    |
| `src/renderer/src/pages/`      | One page component per feature                          |
| `src/renderer/src/components/` | Shared and feature-specific components                  |
| `src/renderer/src/utils/`      | XML parse/serialize, rendering utilities                |
| `src/renderer/src/store/`      | Zustand stores for cross-page state                     |
| `src/renderer/src/packKinds/`  | The `.datf` content-type registry — one module per kind |
| `src/renderer/src/uiforge/`    | UI Layout Forge model, XML round-trip, variable catalog |
| `docs/plans/`                  | Work packages, the deferral register, and shipped plans |

## Testing

Tests use [Vitest](https://vitest.dev/), in two projects — a `node` project for main-process code and pure utilities, and a `jsdom` project for components, hooks and page-level integration. Coverage spans main-process IPC handlers, the `.datf` pack kinds, XML round-trips, renderer hooks and utilities, and integration tests that drive the major editor pages against the real handlers through an in-memory filesystem.

```bash
npm run test
npm run test:coverage   # enforces per-file coverage floors; run this before a PR
```

Test files live alongside source under `src/` using the `*.test.ts` / `*.test.tsx` convention. A separate Playwright-for-Electron suite lives in `e2e/` and is local-only, because it needs a GUI:

```bash
npm run e2e
```

## Releasing

Release notes are authored in **`CHANGELOG.md`**, not hand-edited on GitHub after the fact:

1. As PRs land, add the user-facing change under `## [Unreleased]` (Keep a Changelog format).
2. To cut a release: promote `## [Unreleased]` → `## [X.Y.Z] - YYYY-MM-DD` (add a fresh empty
   `[Unreleased]` above it) and bump the version: `npm version X.Y.Z --no-git-tag-version`.
3. Tag `vX.Y.Z` and push. `release.yml` builds/signs the artifacts, then
   `scripts/changelog-extract.mjs` pulls that version's section into the release body and
   `generate_release_notes` appends the auto PR list beneath it. A missing section falls back
   to the auto notes, so a forgotten entry never fails the release.

## Contributing

Issues and pull requests welcome. Please open an issue before starting significant work.

## Author

[Caeldeth](https://github.com/Caeldeth)

## License

See [LICENSE](LICENSE) for details.
