# Mac and Linux release checks

This page is for an agent that runs on the Mac or the Linux box at the end of a Taliesin release. The Windows checks are done on the Windows dev box during the work; this page covers what only macOS or Linux can show.

Each check names the tracker card it reports to. The tracker is in the document repo (`tracker/issues/HTOO/`). Use the oghma tracker rules: one commit per card, push at once, quote every value you type.

## Before you start

1. Pull `main` and do a clean install:

   ```bash
   git checkout main && git pull --ff-only
   npm ci
   ```

2. Make sure that the Electron binary is present. `npm ci` runs `install-electron` through `postinstall`. If `node_modules/electron/dist` is missing, run `npx install-electron`.
3. Make sure that `ELECTRON_RUN_AS_NODE` is not set. Some agent shells set it, and then Electron runs as plain Node. Run `unset ELECTRON_RUN_AS_NODE` in each shell that builds or runs e2e.
4. Use Node 24 (`.nvmrc`).

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

### A2. e2e on Electron 44 (both OS) — HTOO-553

```bash
unset ELECTRON_RUN_AS_NODE
npm run e2e
```

Expected:

- **macOS:** every spec passes, `app-menu.spec.js` included. That spec runs on macOS only. It covers the menu, Go, and Quit through the close guard (HTOO-569).
- **Linux:** every spec passes except the macOS-only ones, which skip.
- On Windows the result is 12 passed and 5 skipped.

e2e opens and closes its own windows. It needs a desktop session (on Linux, a display), but no clicks.

### A3. e2e does not touch the real settings (both OS) — HTOO-543

The e2e helper redirects `LOCALAPPDATA` and `HYBINDEX_CACHE_DIR` to a temp folder. This check proves that the real files stay the same.

The real locations:

| OS | Settings | World index cache |
| --- | --- | --- |
| macOS | `~/Library/Application Support/Erisco/Taliesin/` | `~/.config/Erisco/hybindex/` |
| Linux | `~/.config/Erisco/Taliesin/` | `~/.config/Erisco/hybindex/` |

```bash
# before
find "<settings dir>" ~/.config/Erisco/hybindex -type f -exec sha256sum {} + | sort > /tmp/before.txt
npm run e2e
# after
find "<settings dir>" ~/.config/Erisco/hybindex -type f -exec sha256sum {} + | sort > /tmp/after.txt
cmp /tmp/before.txt /tmp/after.txt && echo UNCHANGED
```

On macOS use `shasum -a 256` in place of `sha256sum`. If a folder does not exist, say so in the report: then the check proves only that e2e did not create it. It must not exist after the run either.

### A4. The fuses on a packaged build (macOS) — HTOO-381

Build an unsigned universal app, without notarization:

```bash
npm run build
npx electron-builder --mac --dir -c.mac.notarize=false
node scripts/verify-fuses.mjs dist/mac-universal/Taliesin.app
```

Expected: `Electron fuses OK`, with **two** wires (the x64 and the arm64 slice), and each wire shows `EnableEmbeddedAsarIntegrityValidation=ENABLE`. If the build writes another folder (for example `dist/mac-arm64/`), use that path and say so.

On Linux, do the same with `npx electron-builder --linux --dir` and `dist/linux-unpacked/taliesin`. Linux ignores the asar integrity fuse, but the reader checks the other four.

## Part B: checks a person does

Use the packaged app from A4 for B1 and B2. Use `npm run dev` or the packaged app for the others. Ask the person to do each step and tell you what they saw.

### B1. The packaged app starts (macOS) — HTOO-381

With the asar integrity fuse on, a damaged package exits with no window and no message. Open `dist/mac-universal/Taliesin.app`. **Expected:** the splash, then the main window.

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

## For this release (2.14.0)

All of A1 to A4 and B1 to B4 apply. The Windows checks are complete: the portable exe closes with no flash (HTOO-466), and the theme checks for HTOO-355 and the engraved danaan and grinneal chrome are done.

When the release is published, Sabrael runs `npm run publish:version -- v2.14.0` on the Windows box. That closes Taliesin's row on HTOO-382; it is not a Mac or Linux step.
