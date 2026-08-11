# Taliesin

Taliesin is a desktop viewer and editor for [Dark Ages](https://www.darkages.com) client assets and
[Hybrasyl](https://www.hybrasyl.com) world map data. It is the companion to
[Creidhne](https://github.com/hybrasyl/creidhne), which edits the other Hybrasyl XML content.
Taliesin uses Electron, React and MUI.

## Creidhne integration

Taliesin and Creidhne share one world index, which `@eriscorp/hybindex-ts` builds. Set the same
world library folder in each application. The index then stays in sync, so map names, NPC lists
and other cross-references are available in both tools.

The applications can rebuild the index, so it is kept in local storage
(`%LOCALAPPDATA%\Erisco\hybindex\`), not in the world folder that git controls. Both find the same
cache, because its key comes from the path of the world. Builds are incremental.

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

Shows the active library and client paths, the counts in the world index, your recent pages, and
links to the pages you use most. Build or rebuild the index here.

### Map Catalog

Scan a directory of `.map` files to make a catalog. Taliesin renders a thumbnail of each map with
dalib-ts and keeps the thumbnails and the metadata in a `catalog.json` file beside them: dimensions,
description, source tag, your own tags and your notes. Sort and filter by tag, dimensions or source.
Make a minimal Hybrasyl Map XML file from any entry and open it in the Map XML Editor.

### Map XML Editor

Open, edit and save Hybrasyl Map XML beside the rendered client map. The editor covers the Id, Name,
Description, dimensions, Music and flags, with sub-editors for warps, NPCs, reactors, signs and
spawn groups. Put these objects on the canvas and drag them. It reads and writes the world library
from Settings, and asks before you lose unsaved changes.

### Map Maker

Edit `.map` binary files, make new maps, and send them back to the Map Catalog.

- Tabs, an unsaved-changes guard, 100 undo steps, and one clipboard for all tabs.
- Brush, eraser, line, filled and outlined shapes, flood fill and random fill. Select a rectangle to
  move it or copy it.
- Show or hide the background layer, the two foreground layers and the walkability overlay.
- Zoom 25% to 200%, with a grid, an animation preview and collision data.
- Resize with drag handles, export to PNG, divide a large map, or generate a map from parameters.
- Save a selection as a prefab, and stamp a prefab into any map.

### World Map Editor

Edit Hybrasyl WorldMap XML on the client world map image. Each point is a pin that you drag; click
it to edit the name, the target map, the coordinates and the access restrictions.

A world map can show different subsets of the locations, which depend on where the player enters.
Taliesin holds one master set and any number of derived groups:

- `worldmaps/.ignore/MasterMapSet.xml` holds every location and its position.
- Each derived group has a `.meta.json` sidecar that records the master points it excludes.
- Delete a point in a group and Taliesin moves it to the **Excluded** list. It does not remove it.
- **Sync from Master** replaces the points of the group with the master set, less the exclusions.
- **Link to Master** builds the exclusion list for a group that has no sidecar. Do this once.

### Music Manager

Keep a local library of Dark Ages music. **Library** scans a directory, edits the display name and
music ID of each track, and plays it. **Packs** groups tracks into named packs, sets their order and
IDs, then encodes with ffmpeg and deploys to a client working directory. **Client View** shows the
music inside the client archives.

### Sound Effects Browser

Play the sound effects in `legend.dat`, listed by numeric ID with play and stop in each row. Give a
sound a name and a comment; Taliesin saves them to `world/sfx-index.json` in the world library.
Filter by ID, filename or name.

### Archive Browser

Examine `.dat` archives, read-only. Entries are grouped by extension with their name and size. Filter
by name, or open any `.dat` below the client folder from the quick-open menu. Extract one entry or
the whole archive. Previews:

- Sprites and tiles (`.epf`, `.mpf`, `.hpf`, `.spf`), with the palette resolved automatically or
  selected by hand.
- Tileset images (`.tsi`) and PCX images.
- Fonts (`.lft`): the glyphs that carry a bitmap, and a sample string drawn in the client font.
- Tables (`.tbl`): palette maps, tile animations, effects and palette cycles as tables; `color0.tbl`
  as dye swatches.
- Terrain animation tables (`.hea`), font metadata (`.fnt`) and JPF data.
- BIK video, transcoded to MP4 on demand.

Taliesin does not write to `.dat` archives. To add content to a client, compile an asset pack.

### Prefab Catalog

Manage the tile patterns that you saved in the Map Maker. A prefab is a block of tiles kept as JSON
in the active world library. Filter, rename and delete them; the preview draws each one in isometric
view with real client tiles. Stamp a prefab into a map from the Prefab sidebar of the Map Maker.

### Settings

Set the Dark Ages client path and the Hybrasyl world library you share with Creidhne. Set the music
library and its working directories, the ffmpeg path, the asset pack directory and the theme.
Taliesin keeps all of these between sessions.

Taliesin finds Creidhne without help on Windows, macOS and Linux: beside itself first, then the
installed application. Settings shows where it found Creidhne and offers Change, Clear override and
Test Launch. Select a path manually only for an unusual installation.

### Asset Pack Manager

Make, edit and compile `.datf` asset packs for the modern Hybrasyl client. A `.datf` file is a ZIP of
PNG or audio assets and a JSON manifest.

Fourteen content types are supported: ability icons, nation badges, legend mark icons, item icons, UI
sprite overrides, music, sound effects, ambient sounds, world maps, town maps, NPC portraits, static
tiles, creature sprites and UI panels. Each type knows its own filename rule, dimension rule and
`covers` contract, so the editor adapts to the type you select.

Author a pack as a project directory, then compile it. You can import a compiled pack to edit it
again. Set a pack working directory in Settings first.

### Static Tile Manager

Make `static_tiles` packs from ordinary artwork instead of hand-built sheets. Import loose PNGs, a
tile grid or a wang sheet. The converter turns orthogonal art into the 56×27 floor diamond of the
client, and walls keep the height of the source. Taliesin then allocates the tile IDs and writes
into the pack.

It imports many files in one operation and detects the orientation of each cell. A gallery shows the
tiles already in the pack: click one to move it to another ID or to delete it. Before it writes, it
warns about tile IDs that the legacy renderer animates or cycles. The legacy renderer draws over a
pack PNG at those IDs.

### UI Layout Forge

Author `ui_panels` layouts on a visual canvas: add controls from a palette, select, drag, resize and
snap them, edit them in the properties panel, and undo every change. Edit the variant for each
resolution in its own tab. Attach art from a PNG, an installed asset pack or a legacy `.dat`. Connect
a control to a bind target from the variable catalog. Import a legacy prefab control file. Compile to
a `ui_panels` pack (`schema_version` 2), with XML round-trip.

If a layout needs a variable that the server does not supply, the Forge writes a design specification
into `specs/`. It does not let an author invent a binding path.

### Palette & Duotone

Define named colour palettes, then make element-coloured versions of greyscale icons with a duotone
algorithm. **Palettes** lists the palettes and edits each entry: shadow colour, highlight colour, and
dark and light factors. **Colorize** draws a grid of versions for one icon and palette entry, and a
heuristic marks the best one. Taliesin keeps your calibration with the palette. Full scope:
[`docs/plans/complete/taliesin_duotone_scope.md`](docs/plans/complete/taliesin_duotone_scope.md).

### Planned features

**A better procedural map generator.** The Map Maker generator uses unmodified client tiles only. A generator that draws on custom asset packs — themed tile sets, prefab biomes, terrain palettes —
is now possible. `static_tiles` packs already replace tile art by ID.

**The other `.datf` content types.** `effects`, `projectiles`, `display_sprites`, `aisling_body`,
`bundle`, `fonts`, `cutscenes` and `skeletal_animations` are in the format specification but have no
authoring path here. The pack-kind system reads its types from data, so each one is a module and
three registrations, not a new screen.

## Installation

Get a Windows build from the [releases page](../../releases). There are two, and both are signed:

- **`taliesin-<version>-setup.exe`** is the installer. It asks where to install, puts Taliesin in
  the Start menu and on the desktop, and adds an entry to Installed apps. It installs for the
  current user, so it needs no administrator rights. Run it again to upgrade in place.
- **`taliesin-<version>-portable.exe`** runs from wherever you put it and installs nothing.

Both keep their settings in `%LOCALAPPDATA%\Erisco\Taliesin`, so the two see the same libraries and
preferences. Uninstalling leaves that directory alone.

## Remote Desktop

A Remote Desktop session has no GPU. Taliesin detects this, changes to software rendering, and stops
the backdrop blur of the themes, which is the most expensive effect to draw without one. There is no
setting, because the decision must be made before the application starts.

Detection reads `%SESSIONNAME%`. Windows writes it at logon and never changes it. So if you connect
over Remote Desktop to a session that was already open at the console, every process still reports
`Console`, and Taliesin does not notice. Set `TALIESIN_DISABLE_GPU=1` for that case. It is the only
override, and it answers in both directions:

| Value           | Effect                                               |
| --------------- | ---------------------------------------------------- |
| unset or empty  | Use the detection.                                   |
| `0`             | Use hardware acceleration, also in a remote session. |
| any other value | Use software rendering, also on a local machine.     |

## Build from source

```bash
npm install
npm run dev          # development
npm run build:win    # Windows installer
```

Node.js 18 or later is necessary. Development uses Node 24.

## Project structure

| Path                           | Contents                                             |
| ------------------------------ | ---------------------------------------------------- |
| `src/main/`                    | The Electron main process: IPC handlers and file I/O |
| `src/preload/`                 | The preload bridge that exposes `window.api`         |
| `src/renderer/src/pages/`      | One page component for each feature                  |
| `src/renderer/src/components/` | Shared components and feature components             |
| `src/renderer/src/utils/`      | XML parsers and serializers, rendering utilities     |
| `src/renderer/src/store/`      | Zustand stores for state that pages share            |
| `src/renderer/src/packKinds/`  | The `.datf` content-type registry, one module each   |
| `src/renderer/src/uiforge/`    | UI Layout Forge: model, XML, variable catalog        |
| `docs/plans/`                  | Work packages, the deferral register, shipped plans  |

## Testing

The tests use [Vitest](https://vitest.dev/) in two projects: `node` for the main process and the pure
utilities, `jsdom` for components, hooks and page-level integration. Together they cover the IPC handlers, the
`.datf` pack kinds, the XML round-trips, and the renderer hooks and utilities. They also drive the
major editor pages against the real handlers, through an in-memory filesystem. Test files sit beside
the source, named `*.test.ts` or `*.test.tsx`.

```bash
npm run test
npm run test:coverage   # applies the per-file coverage floors; run this before a PR
```

The Playwright suite for Electron is in `e2e/`. It drives the built application, so it needs a GUI
and a build. CI runs it in a Windows job, because the temporary-directory redirect that keeps the
specs away from your own profile works on Windows only.

```bash
npm run e2e
```

## Releasing

Write the release notes in **`CHANGELOG.md`**, not on GitHub after the release.

1. When a PR lands, add its user-facing change below `## [Unreleased]`, in Keep a Changelog format.
2. To make a release, change `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` and add an empty
   `## [Unreleased]` above it. Then set the version with `npm version X.Y.Z --no-git-tag-version`.
3. Tag the commit `vX.Y.Z` and push it.

`release.yml` then builds and signs the artifacts. `scripts/changelog-extract.mjs` puts that
version's section into the release body, and `generate_release_notes` adds the list of PRs below it.
If the section is absent the release uses the automatic notes, so a forgotten entry never fails the
release.

## Contributing

Issues and pull requests are welcome. Open an issue before you start a large piece of work.

## Author

[Caeldeth](https://github.com/Caeldeth)

## License

Read [LICENSE](LICENSE).
