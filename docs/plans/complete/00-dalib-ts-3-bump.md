# WP0 — Bump dalib-ts 2.2.0 → 3.0.0

**Size: S to M — small diff, wide blast radius.** No dependency. **Shipped.** `package.json` now carries `@eriscorp/dalib-ts ^3.1.0`, so this bump and WP1's follow-on 3.1.0 bump have both landed.

**Depends on:** nothing. Read `../00-overview.md` first.

## Goal

Move Taliesin onto dalib-ts 3.x so the rest of the milestone has the decode APIs it needs. 3.0.0 removes no API; the major bump is driven by **decode fixes that change rendered output**, which is exactly the kind of change a feature PR should not hide. That is why it got its own verification pass rather than riding inside WP2 or WP5.

## Decisions (Sabrael, 2026-07-28)

1. **WP0 lands alone, before every other WP in the milestone.** It changes pixels in five places; folding it into a feature branch would make those changes unattributable.

## What changed in rendered output

Each of these touches something Taliesin draws:

- **`renderTile` ground tiles.** Index 0 is now opaque and everything outside the isometric diamond is masked to transparent; padding no longer shows as garbage. dalib verified this against `TILEA.BMP`: ~417k index-0 pixels across 1,143 tiles, and 1,100 stray padding bytes across 65 tiles. **This lands in the archive `.bmp` tileset preview only** — `ArchivePreview.tsx` is Taliesin's sole `renderTile` caller. The map is unaffected, because `mapRenderer.ts` still uses its local `pixelsToImageData` for both ground and walls. Closing that divergence is [WP5](05-sotp-tile-adoption.md) Part B.
- **SPF `left`/`top`/`pitch` are honoured.** Sprite previews that were subtly misplaced move.
- **`ControlFile` no longer invents UI frames** — `<IMAGE>` is an ordered list. Affects UI Layout Forge prefab import (`uiforge/prefabImport.ts`).
- **`HeaFile` masks run intensity with `& 0x3F`.** Affects the darkness preview.
- **`MapFile` reads tile IDs as unsigned** and tolerates trailing bytes. Affects map loading.
- **`PaletteTable` strips `//` comments.** Affects map tile palette lookups.

## Non-goals (stop-lines)

- **The `stcani.tbl` wall-palette defect found during this WP is not fixed here.** It is pre-existing and unrelated to the bump, and fixing it changes map rendering, which would contaminate this WP's verification. [WP5](05-sotp-tile-adoption.md) owns `mapRenderer.ts` and owns that fix; the full finding is recorded there.

## Acceptance criteria

1. `npm run typecheck && npm run lint:check && npm run test:coverage && npm run build` all green.
2. The archive tileset preview (`tilea.bmp` in `seo.dat`) draws opaque diamonds with no holes and no garbage padding. The map editor still looks different — that gap is WP5's.
3. SPF sprite previews sit where they should, now that `left`/`top`/`pitch` are honoured.
4. UI Layout Forge prefab import still produces the right frames after the `ControlFile` `<IMAGE>` ordering fix.
5. The darkness preview (`.hea`) is correct after the `& 0x3F` intensity mask.
6. A map still loads after the `MapFile` unsigned-id and trailing-bytes change, and tile palettes still resolve after `PaletteTable` comment stripping.

Criteria 2–6 change pixels rather than return codes, so a green suite is necessary but not sufficient. They were verified by eye in `npm run dev`.
