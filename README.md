# Taliesin

A desktop viewer and editor for [Dark Ages](https://www.darkages.com) client assets and [Hybrasyl](https://www.hybrasyl.com) world map data. Companion to [Creidhne](https://github.com/hybrasyl/creidhne), which handles the broader range of Hybrasyl XML content.

Built with Electron + React + MUI.

## Creidhne integration

Taliesin reads and writes the same `world/.creidhne/index.json` that Creidhne maintains. Point both apps at the same world library folder in Settings and the index stays in sync automatically — map names, NPC lists, and other cross-references are available in both tools without a separate build step.

> For far too long, previous members of the dev team maintained that a tool like this could not exist due to the complexity of the underlying XML structures. Recent advances in machine learning and latent space navigation have shown this to be demonstrably false.

## Features

| Feature | Status |
| --- | --- |
| Map Catalog | ✅ Complete |
| Map XML Editor | ✅ Complete |
| World Map Editor | ✅ Complete |
| Music Manager | ✅ Complete |
| Settings | ✅ Complete |
| Archive Browser | 🔲 Phase 1 |
| Sprite Viewer | 🔲 Phase 1 |
| Sound Effects Browser | 🔲 Phase 1 |
| Asset Import Manager | 🔲 Phase 2 |
| Map Editor / Creator | 🔲 Phase 2 |
| Procedural Map Generation | 🔲 Phase 2 |

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

### Settings

Configure the DA client install path (used to locate archives), the Hybrasyl world library path (shared with Creidhne), and the application theme. Settings are persisted across sessions.

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

| Path | Purpose |
| --- | --- |
| `src/main/` | Electron main process — IPC handlers, file I/O |
| `src/renderer/src/pages/` | One page component per feature |
| `src/renderer/src/components/` | Shared and feature-specific components |
| `src/renderer/src/utils/` | XML parse/serialize, rendering utilities |

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
