# Folder picker on save — notes for Creidhne

Taliesin's map XML and world map editors now do what Creidhne's
`feat/recursive-subdirectory-support` branch did (recursive `listSection` enumeration, folder-grouped
file lists, subfolder-preserving rename/archive), **plus** one thing Creidhne deliberately left out:
a destination folder picker on save. This note is the handoff for grafting that last part onto
Creidhne's 14 editor pages.

## What Creidhne has today

Folders are discovered, never chosen. `resolveSavePath(library, subdir, selectedFile, fileName)` in
`src/renderer/src/utils/fileTree.js` takes the folder from `relDir(selectedFile.rel)` — the file's
current folder — and a new file always lands at the type root. That is correct behaviour, just not
complete: you can file `universal/x.xml` in git, but you cannot create `universal/y.xml` from the
app.

## What Taliesin added

Three pieces, all small:

1. **`folderOptions(files)`** (`src/renderer/src/utils/fileTree.ts`) — the distinct folders a file
   list occupies, ancestors included, sorted, root excluded. Pass the active *and* archived lists:
   a folder whose files are all archived is still somewhere you might file something.
2. **`normalizeFolder(input)`** (same file) — trims, forward-slashes, collapses repeats, drops
   `.`/`..` segments. Path safety still validates in main; this just makes a typo read as an
   unavailable option instead of an error dialog after the save.
3. **`FolderSelect`** (`src/renderer/src/components/shared/FolderSelect.tsx`) — a MUI
   `Autocomplete freeSolo` over those options, `''` shown as the `(root)` placeholder. `freeSolo`
   is the whole point: folders are not a data model, so typing a new one *is* how you create one.
   Nothing has to `mkdir` — the main-process write already `mkdir -p`s the parent.

Wiring, in `EditorHeader`: four optional props — `folder`, `folderOptions`, `initialFolder`,
`onFolderChange`. The picker renders only when `onFolderChange` is supplied, so editors with no
folder notion are unaffected. `initialFolder` also feeds the existing rename warning, which now
fires on a move as well as a rename and names the full destination:

```
Saving will create "townmaps/Piet.xml" and archive "Piet.xml"
```

Each editor panel holds `folder` in state next to `fileName`, resets it from `initialFolder` in the
same effect that resets `fileName`, and passes `normalizeFolder(folder)` as a third argument to
`onSave`. Pages compose `${dir}/${joinRel(folder, fileName)}`.

## Grafting it onto Creidhne

The only structural change is `resolveSavePath` gaining an explicit folder instead of deriving one:

```js
export function resolveSavePath(library, subdir, selectedFile, fileName, folder) {
  const subDir = folder !== undefined ? normalizeFolder(folder) : relDir(selectedFile?.rel ?? '')
  const newRel = subDir ? `${subDir}/${fileName}` : fileName
  const newPath =
    selectedFile && newRel === selectedFile.rel ? selectedFile.path : `${library}/${subdir}/${newRel}`
  return { newPath, newRel }
}
```

Defaulting `folder` to `undefined` keeps every current call site behaving exactly as it does now, so
the 14 pages can be converted one at a time rather than in one commit.

Two things worth keeping as they are:

- **Archive/unarchive must keep deriving the subfolder from the file's own rel**, never from the
  picker. Archiving is "put this where it was, under `.ignore`", not a save.
- **`subDirWithinType`'s leading-`.ignore` shift still matters.** A save that renames also archives
  the old file, and if that old file was already archived its rel still carries `.ignore/` —
  Creidhne's `58c6518` fix. Taliesin's equivalent is `activeRel()` at every archive-path
  composition site.

## Gotcha found while doing this

A folder picker makes it possible to move a file into a folder *and* rename it in one save. Both the
old and new path then differ, and the old file is archived rather than deleted — the same
"Old file remains (manual delete may be needed)" caveat that already applies to renames, now
reachable two ways. Neither app deletes on rename today; if that changes, it should change for both.
