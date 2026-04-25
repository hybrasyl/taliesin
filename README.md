# Taliesin

A desktop viewer and editor for [Dark Ages](https://www.darkages.com) client assets and [Hybrasyl](https://www.hybrasyl.com) world map data. Companion to [Creidhne](https://github.com/hybrasyl/creidhne), which handles the broader range of Hybrasyl XML content.

Built with Electron + React + MUI.

## Creidhne integration

Taliesin reads and writes the same `world/.creidhne/index.json` that Creidhne maintains. Point both apps at the same world library folder in Settings and the index stays in sync automatically — map names, NPC lists, and other cross-references are available in both tools without a separate build step.

> For far too long, previous members of the dev team maintained that a tool like this could not exist due to the complexity of the underlying XML structures. Recent advances in machine learning and latent space navigation have shown this to be demonstrably false.

## Features

| Feature                   | Status         |
| ------------------------- | -------------- |
| Map Catalog               | ✅ Complete    |
| Map XML Editor            | ✅ Complete    |
| World Map Editor          | ✅ Complete    |
| Music Manager             | ✅ Complete    |
| Sound Effects Browser     | ✅ Complete    |
| Settings                  | ✅ Complete    |
| Archive Browser           | ⬜ Not Started |
| Sprite Viewer             | ⬜ Not Started |
| Sound Effects Manager     | ⬜ Not Started |
| Asset Import Manager      | ⬜ Not Started |
| Map Editor / Creator      | ⬜ Not Started |
| Procedural Map Generation | ⬜ Not Started |

### Map Catalog

Scan a directory of DA client `.map` files and build a browsable catalog. Each map is rendered to a thumbnail via dalib-ts and stored with metadata — dimensions, description, source tag, custom tags, and notes — in a sidecar `catalog.json`. Sort and filter by tag, dimensions, or source. Generate a minimal Hybrasyl Map XML stub from any catalog entry to open directly in the Map XML Editor.

### Map XML Editor

Load, edit, and save Hybrasyl Map XML files alongside the rendered client map. Covers core fields (Id, Name, Description, dimensions, Music, flags) and sub-editors for Warps, NPCs, Reactors, Signs, and SpawnGroups. Objects are placeable and draggable on the map canvas. Syncs with the Hybrasyl world library folder configured in Settings. Includes an unsaved changes guard.

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

### Settings

Configure the DA client install path (used to locate archives), the Hybrasyl world library path (shared with Creidhne), and the application theme. Settings are persisted across sessions.

### Planned Features

**Archive Browser** — inspect and extract entries from DA client `.dat` archive files. Lists all entries with name and size, previews by type (images rendered to canvas, raw hex for unknown formats), and supports extracting individual entries or the full archive to disk.

**Sprite Viewer** — browse and preview DA client sprites loaded from archives or standalone files. Supports `.spf`, `.epf`, `.mpf`, and `.efa` formats via dalib-ts, with frame-by-frame navigation, animated preview, and palette selection.

**Sound Effects Manager** — a companion to the Sound Effects Browser focused on managing SFX assets directly. Planned scope to be defined.

**Asset Import Manager** — inject new tiles and sprites into existing `.dat` archives. Depends on research into how the DA client merges split archive files at runtime; this is a research-heavy feature requiring its own investigation before implementation.

**Map Editor / Creator** — a paint-based editor for DA `.map` binary files covering foreground, background, and walkability layers. Supports new map creation and round-trips with the Map Catalog and Map XML Editor.

**Procedural Map Generation** — parameter-driven generation of `.map` binaries and Hybrasyl XML stubs, with configurable terrain style, density, and optional seed-based reproducibility. Generated maps feed directly into the Map Catalog.

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

| Path                           | Purpose                                        |
| ------------------------------ | ---------------------------------------------- |
| `src/main/`                    | Electron main process — IPC handlers, file I/O |
| `src/renderer/src/pages/`      | One page component per feature                 |
| `src/renderer/src/components/` | Shared and feature-specific components         |
| `src/renderer/src/utils/`      | XML parse/serialize, rendering utilities       |

## Testing

Tests use [Vitest](https://vitest.dev/). No tests exist yet — contributions welcome.

```bash
npm run test
```

Test files should live alongside source under `src/renderer/src/` using the `*.test.ts` / `*.test.tsx` convention.

## Contributing

Issues and pull requests welcome. Please open an issue before starting significant work.

## Author

[Caeldeth](https://github.com/Caeldeth)

## License

See [LICENSE](LICENSE) for details.
