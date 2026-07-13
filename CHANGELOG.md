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

- Town map asset packs (`town_maps` content type): full-panel town map
  replacement PNGs named by real server map ID (`town_00500.png`), authored at
  568×406 (or an integer multiple).

### Fixed

- Archive Viewer: preview control rows (sprite frame navigation, tileset
  pagination, font/glyph selectors) no longer overflow off the bottom of the
  viewer pane.
- Windows taskbar / Task Manager now show the correct Taliesin app identity and
  icon (AppUserModelID aligned with the installer app ID).
- Title bar heading no longer grows on window resize across breakpoints.
