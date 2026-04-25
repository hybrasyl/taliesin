# Taliesin

A desktop viewer and editor for [Dark Ages](https://www.darkages.com) client assets and [Hybrasyl](https://www.hybrasyl.com) world map data. Companion to [Creidhne](https://github.com/hybrasyl/creidhne), which handles the broader range of Hybrasyl XML content.

Built with Electron + React + MUI.

## Creidhne integration

Taliesin reads and writes the same `world/.creidhne/index.json` that Creidhne maintains. Point both apps at the same world library folder in Settings and the index stays in sync automatically — map names, NPC lists, and other cross-references are available in both tools without a separate build step.

> For far too long, previous members of the dev team maintained that a tool like this could not exist due to the complexity of the underlying XML structures. Recent advances in machine learning and latent space navigation have shown this to be demonstrably false.

## Features

| Feature               | Status         |
| --------------------- | -------------- |
| Dashboard             | 🚧 In Progress |
| Map Catalog           | ✅ Complete    |
| Map XML Editor        | ✅ Complete    |
| Map Maker             | 🚧 In Progress |
| World Map Editor      | ✅ Complete    |
| Music Manager         | ✅ Complete    |
| Sound Effects Browser | ✅ Complete    |
| Archive Browser       | 🚧 In Progress |
| Asset Pack Manager    | 🚧 In Progress |
| Prefab Catalog        | 🚧 In Progress |
| Palette & Duotone     | 🚧 In Progress |
| Settings              | ✅ Complete    |
| Sprite Viewer         | ⬜ Not Started |
| Sound Effects Manager | ⬜ Not Started |

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

Inspect entries in DA client `.dat` archive files (read-only). Lists all entries grouped by extension with name and size, supports filter-by-name, and previews several formats: tileset images (.tsi), PCX images with palette selection, terrain animation tables (.hea), font metadata (.fnt), JPF inspection, and BIK video playback (transcoded to MP4 on demand). A quick-open dropdown enumerates all `.dat` files under the configured client folder, including subdirectories. Supports extracting individual entries or the full archive to disk. Sprite formats (.spf/.epf/.mpf/.efa) are not yet previewed.

### Asset Pack Manager

Create and edit modern Chaos.Client `.datf` asset packs — ZIP archives of PNG assets plus a JSON manifest. Provides content-type templates (ability icons, nation badges) for new packs, edits pack metadata and the asset list, and supports deletion. Requires a pack working directory configured in Settings. Compilation to client-ready format and embedded sprite support are not yet implemented.

### Prefab Catalog

Browse and manage reusable map tile patterns saved from the Map Maker. Each prefab is a width × height block of tiles stored as JSON in the active world library. Supports filter-by-name, isometric preview rendered with real client tile bitmaps, rename, and delete. Prefabs are stamped back into a map via the Prefab sidebar in the Map Maker.

### Palette & Duotone

Define named color palettes and generate element-colored variants of grayscale icon assets via a duotone algorithm. The **Palettes** tab lists all palettes and per-entry color editors (shadow + highlight pickers, dark/light factor sliders). The **Colorize** tab renders a grid of variants for a chosen icon × palette entry, with an auto-detection heuristic surfacing the highest-quality variant. Calibration choices are persisted alongside the palette. Full scope is in [`docs/taliesin_duotone_scope.md`](docs/taliesin_duotone_scope.md).

### Settings

Configure the DA client install path (used to locate archives), the Hybrasyl world library path (shared with Creidhne), the music library and working directories, ffmpeg path, asset pack directory, an optional Creidhne companion launcher path, and the application theme. Settings are persisted across sessions.

### Planned Features

**Sprite Viewer** — browse and preview DA client sprites loaded from archives or standalone files. Supports `.spf`, `.epf`, `.mpf`, and `.efa` formats via dalib-ts, with frame-by-frame navigation, animated preview, and palette selection.

**Sound Effects Manager** — a companion to the Sound Effects Browser focused on managing SFX assets directly. Planned scope to be defined.

## Installation

Pre-built releases for Windows are available on the [releases page](../../releases).

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
| `src/renderer/src/recoil/`     | Recoil atoms for cross-page state                       |
| `docs/`                        | Design docs, planning documents, and pattern references |

## Testing

Tests use [Vitest](https://vitest.dev/). The suite runs 408 tests across 25 files covering main-process IPC handlers, renderer hooks and utilities, and integration tests for the major editor pages.

```bash
npm run test
npm run test:coverage
```

Test files live alongside source under `src/` using the `*.test.ts` / `*.test.tsx` convention.

## Contributing

Issues and pull requests welcome. Please open an issue before starting significant work.

## Author

[Caeldeth](https://github.com/Caeldeth)

## License

See [LICENSE](LICENSE) for details.
