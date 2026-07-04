# Static Tile Manager — import, orthogonal→isometric conversion, and wang-tile slicing

## Motivation

Taliesin can *author* a `static_tiles` `.datf` pack (floor/wall PNGs keyed by tile ID) and
*consume* installed `static_tiles` packs in the map editors, but there is no tooling to
**produce** the tile art in the first place. Today an author has to hand-cut every
`floor{id}.png` / `wall{id}.png` at the exact DA geometry, in isometric projection, one
tile at a time. That is the bottleneck for anyone bringing external/orthogonal tilesets
(itch.io packs, Tiled-style wang sheets, hand-drawn square tiles) into a Hybrasyl world.

The **Static Tile Manager** is a dedicated Taliesin page that imports ground/wall tile art,
converts orthogonal source art to DA isometric when needed, slices wang tilesets into the
individual ground tiles DA uses, and feeds the results straight into the existing
`static_tiles` pack pipeline.

## Goal & scope

**In scope**

- Import ground (floor) and wall tile art from external images (PNG sheets or loose PNGs).
- Detect whether source art is **orthogonal** (square/axis-aligned) or already **isometric**
  (diamond), and convert orthogonal → isometric to the DA target geometry when needed.
- **Wang-tile slicing**: take a wang/blob tileset, iso-convert first (if orthogonal), then
  slice it into the set of usable DA ground tiles, assigning tile IDs.
- Preview converted/sliced tiles in-app against the DA diamond grid before committing.
- Emit results into a `static_tiles` pack project so the existing compile → `.datf` path
  and the map editors pick them up unchanged.

**Out of scope (for this iteration)**

- Animated / palette-cycled tiles (the Brigid client skips pack lookup for those — see
  [staticTiles.ts:8](../../src/renderer/src/packKinds/staticTiles.ts#L8); shipping them has no effect).
- Autotile *runtime* logic (choosing which wang variant to place at map-edit time). This tool
  produces the tiles; placement stays in the map editors.
- Editing legacy binary `seo.dat` / `ia.dat` archives in place (legacy binary editing was
  dropped project-wide).

## Background: authoritative DA tile geometry

Pulled from [mapRenderer.ts](../../src/renderer/src/utils/mapRenderer.ts) and the Comhaigne
`dat-files.md` reference. These numbers are the ground truth the converter targets.

> **Terminology (classic DA vs the Brigid pack name).** In classic Dark Ages terms:
> **ground = `TILEA.BMP`** (`seo.dat`, the 56-wide diamonds), and **"static tile" = wall
> tile = `.hpf`** (`ia.dat`, the 28-wide foreground faces — "static" as opposed to the
> animated/palette-cycled tiles). The Brigid client's **`static_tiles` *pack* is broader
> than the classic term**: it bundles *both* `floor` (ground) and `wall` (static/.hpf)
> art under one pack kind. This doc uses **ground/floor** and **wall/static** for the two
> layers and reserves "`static_tiles`" for the Brigid pack that carries both.

| Layer                    | Source (legacy)              | Pixel geometry                    | Palette | MapTile field                     | Pack asset            |
| ------------------------ | ---------------------------- | --------------------------------- | ------- | --------------------------------- | --------------------- |
| **Ground / floor**       | `seo.dat` → `TILEA.BMP`      | **56 × 27** diamond, 1512 B/tile  | `mpt`   | `Background`                      | `floor{id:D5}.png`    |
| **Wall / static (.hpf)** | `ia.dat` → `stc{NNNNN}.hpf`  | **28** px wide (½), variable height | `stc`   | `LeftForeground` / `RightForeground` | `wall{id:D5}.png`     |

Key facts that drive the conversion math:

- **A DA ground tile is already an isometric diamond**, pre-rendered inside a 56×27
  bounding box. "Converting to isometric" therefore means projecting a square source tile
  onto that 56-wide / 27-tall diamond — with the out-of-diamond corner triangles filled from
  neighboring content, **not** masked transparent (floors are fully opaque; see the
  conversion section).
- **Wall tiles are half the width of a ground tile** (28 vs 56) and have variable height;
  they are the vertical faces of the iso projection, not diamonds.
- Screen projection (from the renderer): half-tile width `HTILE_W = 28`, vertical step
  `HTILE_W / 2 = 14`. A tile at map `(x, y)` lands at
  `sx = originX + (x − y)·28`, `sy = originY + (x + y)·14`. Foreground/wall art is bottom-
  anchored: `drawImage(bitmap, sx − 28, sy − bitmap.height + 28)`.
- **Tile IDs are 1-based** and stored raw in `MapTile` (no offset); tile 0 = empty. The pack
  filename ID is the literal `MapTile.Background` / foreground value.

> ✅ **Output geometry — confirmed against Brigid (2026-07).** Verified against
> `Brigid.Data/AssetPacks/StaticTilePack.cs` and Brigid's own
> [static-tiles-authoring-guide.md](../../../brigid/docs/static-tiles-authoring-guide.md):
>
> - **Floor:** `56 × 27`, **fully opaque**, RGBA, filename `floor{id:D5}.png`. Tiles
>   edge-to-edge in the iso grid — do **not** mask the corners transparent. Oversized art is
>   **silently clipped** at the 56×27 atlas cell boundary (the grid packer blits as-is —
>   there is **no resampling** anywhere in the atlas builder,
>   `Brigid.Rendering/TextureAtlas.cs`), so hit 56×27 exactly.
> - **Wall:** `28` wide × **variable height**, transparent background; height must **match the
>   legacy HPF height** for the ID *when replacing a legacy wall* (too tall floats above the
>   floor, too short leaves a gap); brand-new pack-only IDs carry no height constraint — the
>   renderer bottom-anchors whatever height it gets. Filename `wall{id:D5}.png`. Wall art
>   taller than 512px is **silently skipped** by the atlas shelf packer
>   (`MAX_SHELF_ENTRY_SIZE`, TextureAtlas.cs:24) — no warning, the tile just falls back to legacy.
> - **Wall ID range:** the renderer's `IsRenderedTileIndex` filter is
>   `(id > 10012) || ((id % 10000) > 12)` — so IDs `0–12` and `10000–10012` are sentinels that
>   never render, but `13–9999` *do* (they're the legacy wall range). New IDs should be minted
>   **> 10012** only to avoid colliding with legacy walls, not because the client gates there.
>   Server-side the hard ceiling is **≤ 20423** (see
>   [Server-side constraints](#server-side-constraints-hybrasyl) below), giving a mintable window
>   of **10013–20423**. The ID allocator must enforce the server ceiling and the sentinel gaps.
> - **Brand-new IDs render.** MapRenderer's pack preload (phase 2.5,
>   [MapRenderer.cs:519–524](../../../brigid/Brigid.Rendering/MapRenderer.cs#L519)) iterates the
>   *map-scanned* ID sets, not the legacy dict keys, explicitly so pack-only IDs — tiles with no
>   legacy tileset/HPF counterpart — resolve as an **add**, not just a replace. Minting new tile
>   IDs (the whole point of this tool) is a supported client path.
>
> Taliesin's own pack-kind description
> ([staticTiles.ts:29](../../src/renderer/src/packKinds/staticTiles.ts#L29)) previously said
> floor tiles are 28×28 — corrected to 56×27/opaque in the working tree (it was a label only;
> `validate` accepts any size, so no functional bug).

## Server-side constraints (Hybrasyl)

The server never sees a pack — it has **zero knowledge of `.datf` / asset packs** — but it
*does* consume the tile IDs that maps carry, and that imposes hard constraints on the wall-ID
allocator (verified against the Hybrasyl source):

- **Walkability is derived entirely from foreground (wall) tile IDs.** On map load the server
  indexes each nonzero `LeftForeground`/`RightForeground` into a collision table:
  `(Game.Collisions[fg - 1] & 0x0F) == 0x0F` → the cell is a wall
  ([MapObject.cs:546–548](../../../server/hybrasyl/Objects/MapObject.cs#L546)). No map flags
  are consulted; collision is purely table-driven.
- **The table is the embedded legacy `sotp.dat`** — 20,423 bytes, one byte per tile ID, 1-based
  ([Game.cs:894–903](../../../server/hybrasyl/Game.cs#L894), resource at
  `server/hybrasyl/Resources/sotp.dat`).
- **The indexing is unchecked.** A map containing a foreground ID > 20423 throws
  `IndexOutOfRangeException` and **crashes the server on map load**. Combined with the client
  sentinel filter, the real mintable wall-ID window is **10013–20423** (the highest known legacy
  sprite ID is ~18719, leaving ~1,700 fresh IDs of headroom).
- **Every wall ID's walkability is fixed by legacy `sotp.dat`.** An author minting a new wall ID
  inherits whatever passability byte that slot happens to hold — there is no way to declare it
  from the pack side. The manager should therefore read `sotp.dat` and **surface per-ID
  walkability in the allocator** ("next free *blocking* wall ID" vs "next free *passable*"),
  otherwise authors will ship walls players walk straight through.
- **Floor (background) IDs are unconstrained server-side.** The server parses and immediately
  discards the background value ([MapObject.cs:542](../../../server/hybrasyl/Objects/MapObject.cs#L542));
  floors are limited only by the map format's ushort (1–65535).

The `Background`/`LeftForeground`/`RightForeground` bytes are relayed to clients verbatim from
`RawData` — no server-side transformation — so the client-side rules above are the only other
gate.

**The client consults the same table, from a second copy.** Brigid reads `sotp.dat` out of the
client's `ia.dat` archive as a `TileFlags[]`
([TileRepository.cs:44](../../../brigid/Brigid.Data/Repositories/TileRepository.cs#L44)) and uses
it for **local walk-blocking** (`TileFlags.Wall`,
[WorldScreen.Map.cs:254](../../../brigid/Brigid/Screens/WorldScreen.Map.cs#L254)) and for the
**render blend state** (`TileFlags.Transparent`,
[MapRenderer.cs:402–408](../../../brigid/Brigid.Rendering/MapRenderer.cs#L402)). Unlike the
server, the client bounds-checks gracefully — an ID past the table is simply "not a wall".
Client and server agree today *only because both read the same legacy bytes*; any walkability
override mechanism must keep the two in lockstep or players get split-brain movement
(client blocks a walk the server would allow, or rubber-bands where the server rejects). See
the paired override recommendation in
[Recommended Brigid improvements](#recommended-brigid--server-improvements).

## SOTP sourcing: retail Dark Ages vs Hybrasyl (recommendation)

The walkability table (`sotp.dat`) is the one piece of authored data that **both engines must
agree on** — the server for authoritative collision, the client for local movement prediction and
render blend. Today they read **two independent copies**: the server from an embedded assembly
resource ([Game.cs:894](../../../server/hybrasyl/Game.cs#L894)), the client from `sotp.dat` inside
`ia.dat` ([TileRepository.cs:44](../../../brigid/Brigid.Data/Repositories/TileRepository.cs#L44)).
They agree **only because both are unmodified retail bytes** — the moment this tool mints a new
wall ID, that coincidence breaks, and the two disagree (players rubber-band: the client predicts a
walk the server rejects, or vice-versa). Worse, they disagree *asymmetrically*: the client
bounds-checks gracefully (out-of-range → walkable), the server indexes unchecked and **crashes**.

**Why not literally "defer to the client's SOTP" (verified constraint).** The server has **zero DA
archive access** — the embedded `sotp.dat` resource is the *only* tile data it reads anywhere (no
`ia.dat`/`seo.dat` loading exists in the server). It is intentionally self-contained and headless.
Pointing the server at the client's `ia.dat` at runtime would force every deployment to ship the DA
data files (licensing + size) and couple the server to the client's data layout. And the server
must never trust *live* client state for collision (security). So "defer to the client" is realized
at the **content-authoring** layer, not by a runtime dependency.

**Recommended model — one authored source, two projections, layered resolution.**

1. **Base layer = embedded legacy `sotp.dat` (retail default).** Unchanged. Retail-derived and
   existing Hybrasyl worlds keep working with **zero authoring** — the legacy bytes remain the
   default for every ID.
2. **Override layer = per-world SOTP overlay.** A sparse world-data file (`{ id: collisionByte }`)
   the server applies *over* the base at `LoadCollisions` time. Carries walkability for custom /
   minted tiles only. Because minted IDs live in **10013–20423** — inside the existing 20,423-byte
   array — the overlay just **sets bytes in place**; no resize, no format change to the base.
3. **Taliesin is the single authoring surface.** From one set of per-ID walkability declarations it
   emits **both** the client pack `tile_flags` (Brigid recommendation #5) **and** the server overlay
   (#7). The two tables are then *projections of one source* and cannot drift — except by deploying
   one artifact without the other, which the compiler should **warn** about. This is the real
   content-level "defer": client-effective SOTP (legacy + pack flags) and server-effective SOTP
   (legacy + overlay) are guaranteed equal because Taliesin generates them together.
4. **Server adopts Brigid's graceful semantics.** Bounds-check `Game.Collisions[fg - 1]`; an
   out-of-range ID degrades to *walkable* (matching Brigid's `sotpIndex >= Length → false`) instead
   of crashing. This is the single highest-value change here — it fixes the crash **and** makes the
   two engines agree at the table boundary, which is exactly the "handle SOTP like the client does"
   goal, minus the runtime coupling. It's also correct independently of this whole feature.

**Retail vs Hybrasyl, summarized:** retail/legacy worlds → base layer only (no change, no
authoring). Hybrasyl custom content → base + overlay, authored once in Taliesin and projected to
both engines. The server stays authoritative at runtime (it still computes collision itself); only
the *source of the table* becomes shared authored content instead of a silently-diverging baked
copy. See Brigid/server recommendations [#5/#7](#recommended-brigid--server-improvements) (paired
override) and [#6](#recommended-brigid--server-improvements) (the standalone crash fix).

### Longer term: demote `sotp.dat` to legacy-only (Hybrasyl-native tile attributes)

`sotp.dat` is **not ours** — it's a reverse-engineered retail blob: a headerless 20,423-byte array
whose per-byte semantics (`& 0x0F == 0x0F` = wall) are inferred, not authored. Building Hybrasyl's
collision model *on top of* it is backwards, and it's the root of every problem above: the crash
(fixed-size, unchecked), the client/server drift (two copies of the same guessed bytes), and
"you inherit whatever byte the slot holds." The overlay (#7) is the pragmatic patch; the strategic
answer is to stop treating a retail artifact as Hybrasyl's source of truth.

**This fits two directions the project has already recorded**, so it isn't a new axis of work:

- Hybrasyl **already authors rich per-map data in XML** — the Hybrasyl world's `world/xml/maps/*.xml`
  (schema `xml/src/Objects/Map.cs`; Ceridwen is the retail-clone world, the live Hybrasyl world
  shares the schema). Verified across the full 1,021-map corpus: elements are `Flags`, `Warps`,
  `Npcs`, `Reactors`, `Signs`, `SpawnGroup`, `Description` — **no collision/tile element at all**.
  Walkability is the lone gameplay-critical property still *derived* from a binary blob rather than
  declared next to the rest.
- The
  [modern-map-format](../../../Comhaigne/docs/plans/hybrasyl.client/modern-map-format-scoping.md)
  effort is already moving the `.map` blob toward a `.datf`-style container with authored metadata,
  under an explicit "additive: new path beside legacy, never rewrite" rule — a tile-attribute /
  collision concern is a natural rider (that doc notes collision is absent from the map XML today).

**Recommended end-state — a Hybrasyl-native tile-attribute source, sotp as legacy fallback:**

1. **Resolution order:** native tile-attribute declaration (Hybrasyl content) → legacy `sotp.dat`
   (retail IDs nobody re-declared) → graceful walkable default (unknown ID). A Hybrasyl-native world
   using all-new tiles never consults `sotp.dat` at all; retail-derived worlds keep working through
   the fallback. `sotp.dat` becomes a one-time **import seed** (convert legacy bytes → native
   attributes) and a runtime safety net, not the base.
2. **Separate what sotp conflates.** `sotp.dat` crams two unrelated things into one byte:
   **walkability** (server-authoritative, client-predicted — *shared*) and **transparency/blend**
   (pure client render — *client/pack-only*). A native model splits them: walkability into shared
   world/tile data, blend into the pack. Blend never needs to reach the server; walkability never
   needs to be re-guessed.
3. **Keyed by tile ID for now, per-map later.** Keep the DA semantics (walkability is a property of
   the tile ID) so it's a drop-in for both engines' existing ID-keyed lookups and a small server
   change — but house it in the modern map container so a future **per-map collision layer**
   (walkable here, blocking there — where the z-axis ambition also points) is an extension, not a
   rewrite. Don't over-commit to per-map now.
4. **Taliesin authors the native attributes directly** once this lands — the tool's walkability
   surface graduates from *inherit-and-surface* (pick an ID whose legacy byte fits) to *declare*
   (author states wall/passable, tool emits the native attribute for both engines). Same paired-
   compile discipline as #5/#7, just a modern format instead of a legacy-blob overlay.

This is a **larger, cross-repo architectural move** (Hybrasyl server + Brigid + map format), well
beyond this tool and not required for Phase 1–4. It's recorded here because it changes the *target*
of the tool's walkability authoring, and because the overlay (#7) is deliberately the incremental
first rung of this ladder — not a dead end. Until it lands, the tool stays on the overlay model.

The server-facing writeup of this direction lives in Comhaigne as
[sotp-modernization-design.md](../../../Comhaigne/docs/plans/hybrasyl-server/sotp-modernization-design.md)
(the graceful bounds-check, the overlay, and this demote-sotp end-state, pitched at the Hybrasyl
server team). This plan stays canonical for the tool; that doc is canonical for the server model.

## Resolution & scale factor (the "512×512 in Minecraft" problem)

External art is almost never native DA resolution — it's high-res (256×256, 512×512, vector
exports). It must be **resampled to an integer multiple of the DA base unit**, exactly like a
Minecraft resource pack whose 512×512 texture is *logically* a 16×16 block. The DA base unit is
**28 px** — the iso half-tile width (`HTILE_W` in the renderer). A floor is `2 × 28` wide; a
wall is `1 × 28` wide.

**How the client actually consumes tiles (verified against Brigid):** the map renderer blits
each tile 1:1 — `spriteBatch.Draw(atlas, screenPos, SourceRect, Color.White)`
([MapRenderer.cs:187](../../../brigid/Brigid.Rendering/MapRenderer.cs#L187)) — with the iso grid
pitch baked into the world→screen projection at the client's **virtual resolution** (a 640×480
`RenderTarget` today, stretched to the window). So a tile's pixel size must match the pitch at
that virtual resolution. High-res art does **not** render at higher fidelity today — worse, it is
silently mangled: the floor atlas **clips** anything larger than 56×27 at the cell boundary, and
the wall shelf packer **skips** entries over 512px per dimension entirely (no resampling exists
anywhere in the atlas builder). Exact output dimensions are the tool's job; the client won't fix
mistakes, it will silently corrupt them.

Fidelity is gated on the client's
[virtual-resolution-rebase](../../../Comhaigne/docs/plans/hybrasyl.client/virtual-resolution-rebase-scoping.md)
(640×480 → 1280×960, exact 2×), which explicitly names the asset-pack program — `static_tiles`
included — as the supplier of the higher-fidelity art the new resolution needs, filled in
incrementally behind the pack-or-legacy fallback. So compile output targets a **closed set of two
scales — 1× and 2×** (not an open integer factor):

| Scale | Client virtual res | Floor output | Wall output | Status                                    |
| ----- | ------------------ | ------------ | ----------- | ----------------------------------------- |
| **1×** | 640×480           | 56 × 27      | 28 × N      | ships today; default                      |
| **2×** | 1280×960          | 112 × 54     | 56 × 2N     | author-ahead opt-in; renders after rebase |

**Second gate — the pack manifest has no scale field.** The manifest's coverage entry for this
kind is an empty object (`covers: { "static_tiles": {} }`,
[AssetPackManifest.cs](../../../brigid/Brigid.Data/AssetPacks/AssetPackManifest.cs)), and the
registry/renderer have no scale awareness at all — a 2× pack today would just be "oversized art"
(clipped/skipped, per above). So 2× output is gated on **two** Brigid-side changes: the
virtual-resolution rebase *and* a manifest extension (e.g. `covers.static_tiles.scale`) so the
client can tell a 2× pack from a malformed 1× one. See
[Recommended Brigid improvements](#recommended-brigid--server-improvements).

**Why cap at 1×/2× rather than an open `Nx`:** these are the only two resolutions the client
renders — 640×480 now, an *exact* 2× rebase (1280×960, 4:3 preserved) planned; there is no 3×/4×
virtual-resolution target (the window multiplier scales the *stretch*, not the render target). A
closed `{1, 2}` enum gives a two-state toggle, two golden fixtures, trivial validation, and dodges
fractional-pitch/odd-height edge cases. Because the source art is retained (below), lifting the cap
later is a one-line enum extension + one fixture — no redraw. YAGNI until a higher virtual res is
real.

**Non-destructive principle.** The project keeps the author's **high-res source art**; the
compile step resamples it to the selected target scale (area/Lanczos down-filter, point-friendly
for pixel art). Emitting at the other scale is a *recompile*, not a redraw — which is exactly
what the rebase doc wants ("raise the canvas and let packs fill in over time"). Never bake the
author down to 56×27 as the stored asset; 56×27 is only the *1× compile output*.

## Input formats

1. **Loose PNGs** — one tile per file; user tags each as floor or wall.
2. **Grid sheets** — an N×M grid of equal-size cells; user specifies cell width/height (and
   optional margin/spacing, Tiled-style). Each cell becomes one tile.
3. **Wang / blob sheets** — a sheet whose cells encode edge/corner adjacency (2-edge 16-tile,
   2-corner 16-tile "blob-lite", or 47-tile blob). Handled by the slicer (below).

Orientation (orthogonal vs isometric) is **auto-detected** with a manual override:
- Isometric-diamond source: non-transparent pixels form a diamond within each cell → treat
  as already-projected, skip the ortho→iso step (still normalize to target geometry).
- Orthogonal source: cell is a filled square/rectangle → run ortho→iso projection.

## Orthogonal → isometric conversion

Applied per tile cell when the source is orthogonal.

1. **Normalize** the source cell to a square working buffer (letterbox non-square input).
2. **Project** the square onto the DA diamond. The classic 2:1 iso mapping rotates 45° and
   compresses vertically 2:1 so a square maps to the 56×27 diamond (the renderer's `drawDiamond`
   traces exactly this shape — reuse `ISO_HTILE_W` / `ISO_VTILE_STEP` from
   [mapRenderer.ts](../../src/renderer/src/utils/mapRenderer.ts#L371) as the single source of truth
   for the target dims). Implement as **inverse mapping**: for each destination pixel in the
   56×27 (or scale-S) footprint, compute the source UV and sample with an N× supersample average
   — no forward-rotation holes, clean diagonals, and each output pixel is a pure function of the
   source, which makes fixtures trivial.
3. **Fill the full 56×27 footprint — floors are fully opaque, not transparent-cornered.**
   Legacy ground tiles tile edge-to-edge and the neighbors overlap by half a tile in the iso
   grid, so the corner triangles carry real surface, not alpha. The converter must produce an
   opaque 56×27 result; the "diamond" is the *content framing*, not an alpha mask. (Contrast
   with wall art below, which **is** mostly transparent.)
   **Corner fill via wrap-sampling:** the corner triangles are exactly the content of the
   *neighboring* tiles in the iso grid, so for seamless/tileable sources sample the source in
   **wrap (repeat) mode** during the inverse mapping — the corners pick up the opposite edge's
   content and the emitted tiles are seam-free *by construction*. For wang sheets the corner
   content comes from the actual adjacent cell per the adjacency mask instead (see slicing
   below). Non-tileable loose art falls back to clamp-sampling with a seam warning in the
   preview. Validate against a real decoded `seo` tile before locking the projection.
4. **Wall variant**: for wall art the target is the 28-wide vertical face, not a diamond —
   project to the left/right face parallelograms, keep the variable height, and leave the
   non-wall area transparent so it composites over tiles below/behind.

   > ✅ **Wall geometry — confirmed against 19,430 extracted legacy HPF walls (2026-07).**
   > Every real wall is exactly **28 wide** with a height that is a **multiple of 14**
   > (`ISO_VTILE_STEP`, one iso step). Of full-face walls, **~43% have a clean iso-slope top
   > of |0.5|** (a 14px rise/fall across the 28px width) — split almost perfectly **50/50**
   > between the two directions, i.e. the ±slant is the canonical clean-wall roofline and the
   > two directions are the left/right faces; the remaining ~54% is detailed hand-drawn art
   > that carries its own top shape. So the converter: emits **output height = the target
   > height exactly** (the iso slant is carved *inside* the box, never added — a replacement
   > must match the legacy height or it floats/gaps), imposes the iso slant as a configurable
   > `left | right | none` roofline (`none` = plain 28×H rectangle for full textures), and
   > preserves source alpha with premultiplied averaging. Implemented in
   > [tileConvert.ts](../../src/renderer/src/utils/tileConvert.ts) `convertWall`.

Do the projection at the **source's working resolution** (or a high supersample of the target),
then resample down to the selected scale `S` as the last step — projecting at 56×27 directly
throws away detail the diagonals need. Conversion is pure and testable:
`convertOrthoTile(srcImageData, { layer, scale }) → ImageData`, where `scale ∈ {1, 2}` picks the
`56×27`/`112×54` (floor) or `28×H`/`56×2H` (wall) footprint. No Electron/main dependency; lives in
the renderer utils and is unit-tested against fixtures.

## Wang-tile slicing

Order of operations matters: **iso-convert first, then slice** (per the original idea) — the
wang adjacency is defined on the orthogonal grid, so we project the whole sheet (or each cell)
into iso space and *then* pull out the individual DA tiles, preserving edge continuity. This
ordering is also what makes the **opaque corners** correct for wang tiles: each sliced 56×27
footprint overlaps its neighbors' diamonds, and slicing from the projected *sheet* (with overlap)
fills the corner triangles from the actual adjacent cell that the wang mask says belongs there —
slicing cells first and projecting each in isolation would leave the corners guessing.

1. **Parse the wang set**: user picks the wang scheme (2-edge / 2-corner / 47-blob) and cell
   size; the slicer knows the canonical cell→adjacency-mask layout for each scheme.
2. **Iso-convert** each cell via the converter above (skipped if the sheet is already iso).
3. **Slice** into individual `floor` tiles at DA geometry, one per wang combination the target
   world needs.
4. **Assign IDs**: allocate contiguous `floor{id}` slots via `nextSlotId`
   ([helpers.ts](../../src/renderer/src/packKinds/helpers.ts)), and emit a small sidecar
   mapping (wang-mask → tile ID) so a future autotile-aware map editor can consume it. The
   sidecar is informational for this iteration; the pack itself stays a plain `static_tiles` pack.

## Output pipeline

The manager does **not** invent a new pack format. It writes into a `static_tiles` pack
project using the existing kind contract
([staticTiles.ts](../../src/renderer/src/packKinds/staticTiles.ts)):

- Floor tiles → `floor{id:D5}.png`, walls → `wall{id:D5}.png` at the pack root.
- Reuse `nextAssetPath` / `nextSlotId` for ID allocation and `parseSlot` for round-trip.
- From there the standard compile → `.datf` path and the map editors' installed-pack
  consumption work unchanged. No new IPC for output beyond what asset-pack authoring already has.

## UI — new dedicated page

A standalone **Static Tile Manager** page (sibling to the Asset Pack editor, not nested in it —
per decision), roughly:

- **Source panel**: drop/select image(s); choose input mode (loose / grid / wang) and cell params.
- **Orientation control**: auto-detected orthogonal|isometric badge per source, with override.
- **Conversion preview**: live side-by-side of source cell vs projected DA diamond, snapped to
  the iso grid (reuse `drawDiamond` for the overlay).
- **Slice preview** (wang mode): the derived tile set with provisional IDs.
- **Commit**: pick/create a target `static_tiles` pack project and write the tiles in; then hand
  off to the existing compile flow. For **wall** commits the ID allocator enforces the
  10013–20423 window and, when a `sotp.dat` is available, shows per-ID **walkability**
  (blocking/passable) with "next free blocking/passable ID" allocation; when a legacy world is
  loaded, replacement wall IDs **auto-derive the target height** from the *decoded* `ia.dat` HPF
  (raw-size math is invalid for compressed entries — see open questions) with manual entry as
  fallback. (If the paired tile-flags override
  ships in Brigid + Hybrasyl — [recommendations #5/#7](#recommended-brigid--server-improvements) — the
  allocator upgrades from *inherit-and-surface* to letting the author **declare** walkability,
  with the compile emitting both the pack `tile_flags` and the server overlay.)

Add a nav entry alongside the other pages in
[src/renderer/src/pages/](../../src/renderer/src/pages/) (e.g. `StaticTileManagerPage.tsx`).

## Architecture & file touchpoints

New (renderer-only conversion core — no main-process image work needed):

- `src/renderer/src/utils/tileConvert.ts` — `convertOrthoTile`, diamond mask, wall-face
  projection. Pure, reuses `ISO_*` constants from `mapRenderer.ts`.
- `src/renderer/src/utils/wangSlicer.ts` — wang-scheme layouts, `sliceWangSheet`.
- `src/renderer/src/components/statictiles/` — source panel, conversion preview, slice preview.
- `src/renderer/src/pages/StaticTileManagerPage.tsx` — the page + nav wiring.

Reused (no change expected — all verified present):

- `packKinds/staticTiles.ts`, `packKinds/helpers.ts` — output slotting (`parseSlot`,
  `nextSlotId` with per-namespace floor/wall sequences, 1-based).
- `mapRenderer.ts` — geometry constants + `drawDiamond` for the grid overlay; `loadMapAssets`
  already opens `seo.dat`/`ia.dat` via dalib-ts `DataArchive` (the path for HPF wall heights and
  the `gndani.tbl`/`stcani.tbl` eligibility check).
- [imageLoader.ts](../../src/renderer/src/utils/imageLoader.ts) — `loadPixelBufferFromPath` /
  `pixelBufferToPngBytes` (the converter's I/O), `compositeOnTop` (preview compositing);
  `PixelBuffer` (`{ data: Uint8ClampedArray, width, height }`) is the converter's working type.
- [batchPipeline.ts](../../src/renderer/src/utils/batchPipeline.ts) — the `BatchProgress`
  callback pattern for bulk-import progress.
- Existing asset-pack IPC — `pack:addAsset` + `pack:compile`
  ([handlers.ts](../../src/main/handlers.ts)) cover the whole output path; confirms "no new IPC".
- Page wiring is exactly 4 files: `Page` union in `store/uiStore.ts`,
  `components/PageRenderer.tsx`, `components/NavToolbar.tsx`, plus the new page component.

Constraint (from asset-pack-editor-expansion): the renderer cannot import from `src/main/`.
All conversion/slicing is renderer-side on `ImageData`/`ImageBitmap`; only the final
"write PNGs into pack dir" step crosses IPC, and that already exists.

## Phases

1. **Geometry lock + converter core** — with the 56×27 geometry confirmed, ship `tileConvert.ts`
   (ortho→iso for floor + wall, resampling to a scale factor `S`) with fixture-based unit tests.
   No UI. Ship 1× first; the `S` parameter is plumbed but only 1× is exercised until the client
   rebases.
2. **Manager page — loose + grid import** — page scaffold, source panel, orientation detect,
   conversion preview, commit-to-pack for non-wang tiles. Includes the wall-ID allocator
   constraints (10013–20423), `sotp.dat` walkability surfacing, and `ia.dat` auto-height for
   replacement walls — these shape the commit UI, so they land with it.
3. **Wang slicing** — `wangSlicer.ts` + slice preview + ID allocation + sidecar mapping.
4. **Polish** — batch import, re-open/edit committed tiles, warnings surfacing, and the
   animated/cycled-ID pre-flight (read `gndani.tbl`/`stcani.tbl` via the existing dalib-ts
   archive path and warn at ID-assignment time instead of the authoring guide's
   test-in-client-and-see workflow).

## Open questions

Resolved during scoping (kept for the record):

- ~~Target floor geometry: 56×27 vs 28×28~~ → **56×27 opaque**, confirmed against Brigid.
- ~~Wall = one PNG or separate left/right faces~~ → **keyed by ID, not side.** `wall{id}.png`
  is looked up by the raw `LeftForeground` / `RightForeground` *value*; whichever foreground
  ID a tile carries maps to its own PNG. No separate left/right art per ID.
- ~~Palette handling~~ → pack PNGs are **RGBA truecolor, rendered as-is (no `mpt`/`stc` remap)**;
  imported truecolor art is faithful. Author must export RGBA8888, not indexed.
- ~~Do high-res imports render at higher fidelity?~~ → **Not today.** Brigid blits tiles 1:1 at
  the 640×480 virtual resolution ([MapRenderer.cs:187](../../../brigid/Brigid.Rendering/MapRenderer.cs#L187)),
  so 1× = 56×27 is the only fidelity that renders. Higher scales are gated on the client's
  [virtual-resolution rebase](../../../Comhaigne/docs/plans/hybrasyl.client/virtual-resolution-rebase-scoping.md).
  Tool keeps high-res source + resamples per scale, so it's ready when the rebase lands.

- ~~Scale factor range~~ → **closed `{1×, 2×}` enum**, not an open integer. 1× default; 2× is
  author-ahead opt-in that renders after the client rebase (and a manifest `scale` field — see
  the second-gate note above). Source art retained so the cap lifts cheaply if a higher virtual
  res ever ships.
- ~~Do brand-new IDs (no legacy counterpart) render?~~ → **Yes.** MapRenderer's pack preload
  iterates map-scanned IDs, not legacy dict keys, explicitly to support pack-only "add"
  ([MapRenderer.cs:519–524](../../../brigid/Brigid.Rendering/MapRenderer.cs#L519)).
- ~~Wall height source~~ → **auto-derive from `ia.dat` for replacement IDs**, with one caveat:
  the `(hpfFileSize − 8) / 28` formula (`EstimatedPixelHeight`,
  [CompressedHpfFile.cs:26](../../../brigid/Brigid.Data/Models/CompressedHpfFile.cs#L26)) is only
  valid for **uncompressed** HPFs — it returns **0 for compressed files** (the common case), where
  height is unknown until decompressed. So the deriver must **decompress the HPF and measure the
  decoded pixel height**, not stat the raw entry; dalib-ts already handles the decompression path
  Taliesin uses to render walls. Manual entry stays the fallback when no legacy world is loaded.
  **Pack-only new IDs have no height constraint** (renderer bottom-anchors any height); matching
  only matters for replacements.
- ~~Eligibility (cycled/animated IDs)~~ → **warn at ID-assignment time** by reading
  `gndani.tbl` (seo.dat) / `stcani.tbl` (ia.dat) through the same archive path; Phase 4.
  Brigid enforces nothing here, so the tool's warning is the only guard.

Still open:

- **Wang schemes to support first** — 2-corner blob is the most common for ground autotiling;
  confirm which scheme(s) the target worlds actually use before building all three.
- **`sotp.dat` sourcing** — mostly resolved by the client-side copy: `sotp.dat` is an *entry
  inside `ia.dat`* (Brigid reads it from `DatArchives.Ia`), so when a legacy world is loaded
  Taliesin gets the walkability table from the same archive it reads walls from — no server
  checkout needed. Residual question: whether to offer a file-picker override for a server
  whose *embedded* copy has been patched away from the client's (the lockstep caveat above);
  allocator degrades to range-only checks when no table is available.
- **Corner treatment on ortho→iso floor projection** — wrap-sampling is the chosen approach
  (conversion step 3); still confirm against a decoded `seo` (TILEA.BMP) tile that legacy
  corners really carry neighbor content before locking the fixtures. (Wall geometry is now
  ground-truth-confirmed against the extracted HPF corpus — see conversion step 4 — but the
  floor-corner check needs decoded `seo` tiles, which weren't in the wall extract.)

## Test plan

- Unit: `convertOrthoTile` against fixtures — floor: square in → **fully opaque 56×27** out
  (every pixel alpha 255), known-pixel spot checks; wall: transparency preserved outside the
  face. Wrap-mode corner fill: corner-triangle pixels equal the opposite edge's source content.
  Idempotency when input is already iso. Fixtures follow the `solidSource()` `PixelBuffer`
  pattern from [duotone.test.ts](../../src/renderer/src/utils/__tests__/duotone.test.ts)
  (node-env vitest under `utils/__tests__/`).
- Unit: wall-ID allocator — never allocates 0–12, 10000–10012, or > 20423; walkability-filtered
  allocation picks the next ID whose `sotp.dat` byte matches the requested passability.
- Unit: `sliceWangSheet` — a synthetic 16-tile 2-edge sheet slices into 16 correctly-masked
  tiles with expected IDs and sidecar mapping; sliced-tile corners carry adjacent-cell content.
- Integration (renderer): import a grid sheet, convert, commit to a `static_tiles` project,
  assert `floor{D5}.png` files land with sequential IDs and the pack round-trips via `parseSlot`.
- Visual regression (optional): render committed tiles through `mapRenderer` and diff against
  a golden mini-map.

## Tradeoffs

- **Renderer-side conversion** (Canvas/ImageData) over a main-process image lib: keeps the
  no-`src/main`-import constraint, avoids a new native dep, and lets the preview reuse the exact
  same code path that commits — at the cost of doing pixel work on the UI thread (mitigate with
  an `OffscreenCanvas`/worker if batch sizes hurt).
- **Emit plain `static_tiles` packs, wang mapping as a sidecar**: no format churn, immediate
  compatibility with the shipping client and map editors; the richer autotile-at-edit-time
  story is deferred rather than baked into the pack now.

## Recommended Brigid & server improvements

Surfaced while verifying this design against the Brigid **and** Hybrasyl-server source. Each maps
to a pain this tool otherwise has to work around; none blocks Phase 1–2, but the manifest scale
field blocks the 2× story outright, and the server bounds-check (#6) fixes an outright crash.

1. **Manifest scale field** — `covers.static_tiles.scale: 1 | 2` (default 1, absent = 1 so
   existing packs are untouched). Prerequisite for 2× output meaning anything: today the
   registry/renderer have no scale concept and a 2× pack is indistinguishable from malformed 1×
   art. The manifest comment already anticipates extension ("fields can be extended later
   without breaking existing packs", AssetPackManifest.cs).
2. **Load-time validation warnings** — floor ≠ 56×27, floor contains transparency, wall width
   ≠ 28, target ID is animated/cycled. All four are mandated by Brigid's own
   `static-tiles-authoring-guide.md` but enforced nowhere in code; the `[asset-pack]` stderr
   warning channel already exists to carry them.
3. **Fix silent oversized-art handling** — the floor grid packer clips oversized art at the
   cell boundary and the shelf packer drops >512px entries (`MAX_SHELF_ENTRY_SIZE`,
   TextureAtlas.cs:24), both without a word. Silent visual corruption is the current failure
   mode for a mis-sized pack; at minimum, warn with the offending filename.
4. **Expose sentinel/eligibility data machine-readably** — the `IsRenderedTileIndex` bounds
   (DALib) and the animated/cycled ID lists are only discoverable by reading client source or
   testing in-game. A small exported constants module (or a doc table generated from code) lets
   external tools like this one stop hard-coding `0–12` / `10000–10012`.
5. **Pack-carried tile-flags override (paired with #7 — do not ship one without the other).**
   Extend the coverage entry with per-ID flag declarations, e.g.
   `covers.static_tiles.tile_flags: { "<id>": { "wall": true, "transparent": false } }`, merged
   over the legacy `SotpData` after load with the same priority rules as art. This lets an
   author *declare* walkability and blend state for minted wall IDs instead of inheriting
   whatever legacy byte the slot holds. The `transparent` half is purely client-side (blend
   state) and safe on its own; the `wall` half is only safe **in lockstep with the server**
   (#7) — a client-only wall flag produces split-brain movement. Until both land, the manager's
   shipping behavior stays inherit-and-surface (allocator shows the legacy byte; author picks an
   ID whose walkability already matches intent).
6. **(Server) Graceful SOTP bounds-check — fixes an outright crash.** The server indexes
   `Game.Collisions[fg - 1]` **unchecked** ([MapObject.cs:546](../../../server/hybrasyl/Objects/MapObject.cs#L546));
   a foreground ID > 20423 throws `IndexOutOfRangeException` and takes down map load. Guard it so
   out-of-range degrades to *walkable*, matching Brigid's own graceful behavior
   ([WorldScreen.Map.cs:251](../../../brigid/Brigid/Screens/WorldScreen.Map.cs#L251)). This is
   independently correct and aligns the two engines at the table boundary — the safe, minimal
   realization of "handle SOTP like the client does." Do this regardless of the rest.
7. **(Server, paired with #5) Per-world SOTP overlay.** Add a world-data file mapping
   `id → collision byte`, applied over the embedded `sotp.dat` at `LoadCollisions` time
   ([Game.cs:894](../../../server/hybrasyl/Game.cs#L894)); minted IDs (10013–20423) sit inside the
   existing array so it's an in-place byte set, no resize. Taliesin compiles **both artifacts from
   the one authoring surface** — the pack `tile_flags` (#5) for the client and this overlay for the
   server — so the two tables cannot drift except by deploying one without the other, which the tool
   warns about at compile time. Full rationale + retail-vs-Hybrasyl model in
   [SOTP sourcing](#sotp-sourcing-retail-dark-ages-vs-hybrasyl-recommendation). Until both land,
   the allocator stays inherit-and-surface (author picks an ID whose legacy walkability already
   matches intent).
