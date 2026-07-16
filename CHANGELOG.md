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
-->

## [Unreleased]

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
- Map Editor now lists maps filed in subdirectories of `maps/` (and of
  `maps/.ignore/`), matching what the server loads and what the world index
  catalogues. Rows show the subfolder, so two maps sharing a filename across
  folders stay distinguishable.
- Archiving or unarchiving a map now mirrors its subfolder — `townmaps/x.xml`
  archives to `.ignore/townmaps/x.xml` and returns to where it came from,
  instead of being flattened onto the archive root (where two maps of the same
  name would silently collide and one would be renamed).

### Fixed

- The world index is no longer built twice when opening a library with a stale
  cache, and pages that read it now share one build instead of each starting
  their own.
- Archive Viewer: preview control rows (sprite frame navigation, tileset
  pagination, font/glyph selectors) no longer overflow off the bottom of the
  viewer pane.
- Windows taskbar / Task Manager now show the correct Taliesin app identity and
  icon (AppUserModelID aligned with the installer app ID).
- Title bar heading no longer grows on window resize across breakpoints.
