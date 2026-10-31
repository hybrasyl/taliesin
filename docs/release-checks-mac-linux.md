# Mac and Linux release checks

This page is for an agent that runs on the Mac or the Linux box at the end of a Taliesin release. Most Windows checks are done on the Windows dev box during the work, and README "Releasing" lists the packaged-build checks done at release time. This page covers what only macOS or Linux can show.

Each check names the tracker card it reports to. The tracker is in the document repo (`tracker/issues/HTOO/`). Follow the writing conventions in that repo's `AGENTS.md`: commit straight to `main`, one commit per card, message `tracker: HTOO-<n> comment`, stage only paths under `tracker/`, set `updated` to the real time, and push at once.

## Before you start

1. Pull `main` and do a clean install:

   ```bash
   git checkout main && git pull --ff-only
   npm ci
   ```

2. Make sure that the Electron binary is present. `npm ci` runs `install-electron` through `postinstall`. If `node_modules/electron/dist` is missing, run `npx install-electron`.
3. `npm install-scripts ls` must print `No packages with unreviewed install scripts.` On macOS this is where a missing `fsevents` approval shows (it is installed only on macOS). Report anything it lists; do not approve it yourself.
4. Make sure that `ELECTRON_RUN_AS_NODE` is not set. Some agent shells set it, and then Electron runs as plain Node. Run `unset ELECTRON_RUN_AS_NODE` in each shell that builds or runs e2e.
5. Use Node 24 (`.nvmrc`).
6. Quit any running Taliesin. A3 hashes the real settings folder, and a running copy changes files there.

## How to report

- Record each result as a comment on the card that the check names. Give the date, the OS and version, the commit (`git rev-parse --short HEAD`), the command, and what you saw.
- A failure is a comment too. Copy the exact output. Do not change the code in the same session unless Sabrael asks.
- Do not change a card's status yourself. Sabrael closes HTOO-569 and HTOO-550 after the results are in.
- Some checks need a person to look at the window. You cannot see the window, so ask the person at the machine to do those steps, and record their answer.

## Part A: commands the agent runs

### A1. The unit suite and the gate (both OS)

```bash
npm run typecheck && npm run lint:check && npm run test:coverage && npm run build
```

Every step must pass. Report the test count.

### A2 and A3. e2e on Electron 44, and the real settings stay the same (both OS) — HTOO-553, HTOO-543

A2 runs the e2e suite (HTOO-553). A3 proves that it does not touch the real settings or the world index cache (HTOO-543): the e2e helper redirects `LOCALAPPDATA` and `HYBINDEX_CACHE_DIR` to a temp folder. One e2e run serves both, and it rebuilds the app first, so do not run it twice.

The real locations:

| OS    | Settings                                         | World index cache                                |
| ----- | ------------------------------------------------ | ------------------------------------------------ |
| macOS | `~/Library/Application Support/Erisco/Taliesin/` | `~/Library/Application Support/Erisco/hybindex/` |
| Linux | `~/.config/Erisco/Taliesin/`                     | `~/.config/Erisco/hybindex/`                     |

hybindex-ts 1.2.0 moved the macOS cache from `~/.config/Erisco/hybindex/` (HTOO-586). On macOS, hash the old folder too, if it exists: an e2e run must not change either one.

```bash
unset ELECTRON_RUN_AS_NODE
S="<settings dir from the table>"
H="<world index cache dir from the table>"
T=$(mktemp -d)
ls -d "$S" "$H"     # say in the report which ones exist
find "$S" "$H" -type f -exec sha256sum {} + 2>/dev/null | sort > "$T/before.txt"
npm run e2e
find "$S" "$H" -type f -exec sha256sum {} + 2>/dev/null | sort > "$T/after.txt"
cmp "$T/before.txt" "$T/after.txt" && echo UNCHANGED
ls -d "$S" "$H"     # a folder that did not exist before must not exist now
```

If `sha256sum` is missing, use `shasum -a 256`.

Expected for A2:

- **macOS:** 21 passed. That includes the five tests in `app-menu.spec.js`, which runs on macOS only. It covers the menu, Go, and Quit through the close guard (HTOO-569).
- **Linux:** 16 passed and 5 skipped. The skips are `app-menu.spec.js`.
- On Windows the result is also 16 passed and 5 skipped.

A different total means that a spec was added or was not collected. Say so in the report.

e2e opens and closes its own windows. It needs a desktop session but no clicks. On a Linux box with no display, use `xvfb-run -a npm run e2e`.

Expected for A3: `UNCHANGED`, and no new folder.

### A4. The fuses on a packaged build (both OS) — HTOO-381

On macOS, build an unsigned universal app, without notarization:

```bash
npm run build
npx electron-builder --mac --dir --universal -c.mac.notarize=false
node scripts/verify-fuses.mjs dist/mac-universal/Taliesin.app
```

`--universal` is required. `--dir` replaces the configured targets, and without an arch flag it builds only the host's architecture (`dist/mac-arm64/` on Apple Silicon), which has one wire.

Expected: `Electron fuses OK on dist/mac-universal/Taliesin.app (2 wires)`. There is one wire for each slice (x64 and arm64), and each wire shows all five fuses as the yml sets them, including `EnableEmbeddedAsarIntegrityValidation=ENABLE`. If the Mac has no Developer ID certificate, electron-builder prints `skipped macOS application code signing`. That is expected.

On Linux, run `npx electron-builder --linux --dir`, then `node scripts/verify-fuses.mjs dist/linux-unpacked/taliesin`. Expected: one wire. The reader checks all five fuses on Linux too: electron-builder sets the asar integrity fuse there, and Linux does not enforce it.

### A5. The packaged app gets past the asar check (macOS) — HTOO-381

With the asar integrity fuse on, a damaged package exits with no window and no message. The only signs of the failure are a non-zero exit and `ASAR Integrity Violation` on stderr, so start the binary from the terminal. Point it at a temp folder so that it does not write the real settings:

```bash
T=$(mktemp -d)
LOCALAPPDATA="$T" HYBINDEX_CACHE_DIR="$T/hybindex" \
  dist/mac-universal/Taliesin.app/Contents/MacOS/Taliesin 2>"$T/stderr.txt" &
P=$!; for i in $(seq 1 10); do kill -0 $P 2>/dev/null || break; sleep 1; done
kill -0 $P 2>/dev/null && { echo "RUNNING after 10s"; kill $P; } || { wait $P; echo "EXITED $?"; }
grep -i integrity "$T/stderr.txt"
```

Expected: `RUNNING after 10s`, and no integrity line. B1 then checks what the window shows.

## Part B: checks a person does

Use the packaged app from A4 for B1 and B2. Use `npm run dev` or the packaged app for the others. Ask the person to do each step and tell you what they saw.

### B1. The packaged app starts (macOS) — HTOO-381

Open `dist/mac-universal/Taliesin.app`. **Expected:** the splash, then the main window.

### B2. The Dock and Finder icon (macOS) — HTOO-550

Open the packaged app, and put Mabon in the Dock beside it. **Expected:** Taliesin's icon is the same size as Mabon's, with no white border or light plate around it. Look in Finder too.

### B3. macOS support (macOS) — HTOO-569

1. **Title bar:** on each of the six themes, the stoplights sit centred in the bar, and nothing else is in the bar.
2. **Menu greying:** File → Save is available only when an editor has unsaved changes or a Map Maker tab is open. Go marks the current page. With a dialog open, menu items do nothing.
3. **⌘Q with unsaved work:** make an edit, press ⌘Q. Save or Discard quits the app. Cancel keeps it open, and a later close with the red button does not quit.
4. **Shortcuts in the Map Maker:** ⌘S saves, ⌘Z undoes, ⇧⌘Z redoes, ⌘C and ⌘V copy and paste, ⌘W closes the Map Maker tab. In a text field, ⌃K deletes to the end of the line.
5. **Trackpad:** a pinch zooms the Map Maker and the World Map Editor, one step for about 40 px of movement, not too fast. A two-finger scroll pans the world map.
6. **After ⌘W:** with no window open, choose Go → Map Maker in the menu bar. A window opens.
7. **The packaged app** shows "Taliesin" in the menu bar.
8. **Check for Updates:** Taliesin → Check for Updates… opens Settings and brings the About card into view. Its button says that Taliesin is up to date, or names a newer version (HTOO-382).

### B4. Client file names with mixed case (Linux) — HTOO-287

Linux file names are case-sensitive. The official installer writes `Legend.dat`, and Taliesin asks for `legend.dat`. This check proves that Taliesin finds each file under the case the disk uses.

1. Copy a Dark Ages client folder to the Linux box, and keep the installer's file names exactly (`Legend.dat` and others with capitals). Do not fold the names to lower case.
2. In Settings, set the Dark Ages client folder to that copy.
3. **Archive Browser:** the `.dat` files are listed, and each opens.
4. **Sound Effects:** the page loads (it reads `legend.dat`).
5. **Map Maker:** open a map. The ground and the walls draw (`seo.dat`, `ia.dat`).
6. **World Map Editor:** the legacy world map art draws (`setoa.dat`).

**Expected:** no "not found" message and no empty page. If one fails, record the file name as it is on disk.

### B5. The bars on the six themes (Linux) — HTOO-572

Change the theme in **Settings → Appearance**. Do these steps on each of the six themes.

1. **The title bar and the nav bar:** Hybrasyl, Chadul, Danaan and Grinneal have dark bars with light text and icons, with a black outline. The Danaan bars are bronze and the Grinneal bars are brown. Nothing is engraved. Mundanes and Dubhaimid are flat, with no outline. On each theme the nav bar has a different colour from the title bar, so the two bars do not look like one bar (HTOO-629). On each theme the bar text, the window buttons and the nav icons are easy to read.
2. **The hover:** the close button turns red under the pointer. The other window buttons and the nav buttons show a hover that is easy to see.
3. **The open page:** its nav button has a light background and a ring inside its edge, in the bar's text colour.

**Expected:** each step is true on each theme. If one fails, record the theme and the step.

### B6. Launch Creidhne from an AppImage (Linux) — HTOO-584

An AppImage runs from a temporary mount, so Taliesin must look for Creidhne beside the `.AppImage` file, not beside its own binary.

1. Put a Taliesin AppImage and a Creidhne AppImage in one folder, for example `~/Downloads`, with their release names (`taliesin-<version>.AppImage`, `Creidhne-<version>.AppImage`: Creidhne's has a capital C). Make both executable.
2. Make sure that no Creidhne is installed another way: no `.desktop` entry, and no Creidhne path in Taliesin's settings.
3. Start the Taliesin AppImage. Click **Launch Creidhne** in the nav bar.

**Expected:** Creidhne starts, and Taliesin does not ask you to select it. **Settings → Companion App** shows the AppImage in the same folder. If Taliesin asks you to select Creidhne, record the folder and the two file names.

### B7. The default Brigid assets folder (both OS) — HTOO-585

1. Open **Settings → Installed Asset Packs**.
2. Click **Use default location**.

**Expected:** the field shows `~/Library/Application Support/Erisco/Brigid/assets` on macOS and `~/.config/Erisco/Brigid/assets` on Linux, with `Erisco` in capitals. On Linux, if `XDG_CONFIG_HOME` is set to an absolute path, the field shows `$XDG_CONFIG_HOME/Erisco/Brigid/assets`. If Brigid is installed on the machine, its packs folder is that same folder. If the field stays empty or shows another folder, record what it shows. Before the click, the empty field's example names the same folder for the OS.

### B8 and B9 use a copy of the world

B8 and B9 move files. Copy `world`'s `xml/` and `mapfiles/` into one temp folder, under your home folder so that the Trash is the one in your home folder. In Settings, set the library to the copy's `xml/` and add the copy's `mapfiles/` as a map directory. Never run them on the `world` checkout.

### B8. Delete moves a map to the Trash (both OS) — HTOO-633

No test uses the real OS trash: the unit tests replace it, and e2e does not delete.

1. On the Maps page, open a map, for example `Abel Grotto/hyb31705 - Abel Grotto 3-2`.
2. Click **Delete** on the page toolbar, then **Delete** in the confirmation.

**Expected:** the file is gone from the copy's `xml/maps/`, and the Active count is one less. The file is in the Trash: on Linux, in `~/.local/share/Trash/files/`, with a `.trashinfo` in `~/.local/share/Trash/info/` that gives the original path; on macOS, in `~/.Trash/`. Remove it from the Trash after the check.

### B9. Stage and Release a map on real data (both OS) — HTOO-634

e2e stages and releases a small made-up world. This check uses real maps, whose folders and names have spaces and capitals.

1. On the Maps page, open a map that other maps warp to, for example `Abel Grotto/hyb31703 - Abel Grotto 2-2`. Click **Stage**.
2. The dialog lists the live files that name the map. Compare the list with `grep -rl ">Abel Grotto 2-2<" xml/` in the copy. Click **Stage**.
3. Turn on **Staged**, open the map, and click **Release**.

**Expected:** after step 2, the XML is in `.staging/maps/Abel Grotto/` beside `xml/`, and `mapfiles/lod31703.map` stays where it is. After step 3, the XML is back at its first path, and it is the same, byte for byte, as the file in `world` (`cmp`). `.staging/` holds no file.

## For this release (November 2026)

Rewrite this section for each release: what applies, and what is already done. The release order is in the document repo's `docs/plans/releases/2026-11-release-plan.md`. The list of owed checks is the November 2026 comment on HTOO-239.

All of A1 to A5 and B1 to B9 apply.

- **A1 on Linux:** report how long each `ThemeGallery.test.tsx` theme takes. Each theme has 60 s (HTOO-572); a theme near the limit is a finding.
- **B5** is new (#101, HTOO-572 and HTOO-629). It includes the nav bar's own colour.
- **B7** is new (HTOO-585).
- **B6** is new (HTOO-584). Creidhne has the same fix; one AppImage pair checks both directions if you also click **Launch Taliesin** in Creidhne.
- **B8** is new (#111, HTOO-633) and **B9** is new (#113, HTOO-634).

The Windows checks for #101 to #114 are in each PR.

**Linux is done** (2026-10-31, at `6ba9903`; the results are on each card and on HTOO-239). A1 failed on one test, which is fixed on `main` after `6ba9903`; run A1 again on macOS at the newer commit. Everything else passed, and B5 passed by eye. **Owed: macOS**, A1 to A5, B1 to B3 and B7 to B9.
