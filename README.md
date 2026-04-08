# Taliesin

A desktop viewer and editor for [Dark Ages](https://www.darkages.com) client assets and [Hybrasyl](https://www.hybrasyl.com) world map data. Companion to [Creidhne](https://github.com/hybrasyl/creidhne), which handles the broader range of Hybrasyl XML content.

Built with Electron + React + MUI.

> For far too long, previous members of the dev team maintained that a tool like this could not exist due to the complexity of the underlying XML structures. Recent advances in machine learning and latent space navigation have shown this to be demonstrably false.

## Features

- **Map catalog** — browse the full client map library with thumbnail previews
- **Map XML editor** — create and edit Hybrasyl map XML files with a visual tile editor for warps, NPC spawns, and reactors
- **World map editor** — edit world map point sets with canvas placement; supports derived groups linked to a master set, with per-group exclusions and one-click sync
- **Archive browser** — inspect raw Dark Ages client archive files
- **Sprite viewer** — browse and preview client sprites
- **Music manager** — manage a local audio library with metadata editing and playback; organize tracks into packs with music ID assignment and ffmpeg-based deployment to client working directories; browse music directly from DA client archives
- **Unsaved changes guard** — prompts before navigating away or closing

## World map groups

World map sets show different subsets of locations depending on where the player accesses the map from (e.g. entering Pravat Cave from the north vs. south shows a different active node). Taliesin models this as a **master set** plus **derived groups**:

- `worldmaps/.ignore/MasterMapSet.xml` — canonical set of all locations and their canvas positions
- Each active group XML is derived from the master, with a sidecar `.meta.json` (also in `.ignore/`) recording which master points are excluded
- Opening a derived group in the editor shows active points and a collapsible **Excluded** list; deleting a point moves it to excluded rather than removing it permanently
- **Sync from Master** replaces the group's points with master-minus-exclusions
- **Link to Master** (one-time migration) computes the exclusion list automatically from an existing group file

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

## Planned features

### Phase 1 (in progress)

- **Archive browser** — list, preview, and extract entries from `.dat` client archives
- **Sprite viewer** — frame-by-frame and animated preview for `.spf`, `.epf`, `.mpf`, `.efa` sprites with palette selection
- **Sound effects browser** — list and preview SFX entries from archives

### Phase 2

- **Asset import manager** — inject new tiles and sprites into existing `.dat` archives; depends on research into how the DA client merges split archive files
- **Map editor / creator** — paint-based editor for DA `.map` binary files (foreground, background, walk layers); new map creation and round-trip with Map XML Editor
- **Procedural map generation** — parameter-driven generation of `.map` binaries and Hybrasyl XML stubs, with optional seed-based reproducibility

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
