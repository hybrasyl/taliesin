import { create } from 'zustand'
import {
  PaletteResolver,
  type ArchiveProvider,
  type DataArchive,
  type DataArchiveEntry
} from '@eriscorp/dalib-ts'

/**
 * The open legacy archive, its palette siblings, and the resolver built from
 * them.
 *
 * This lives in a store rather than in props for a concrete reason. React
 * 19.2's development build logs a `performance.measure` per commit for the
 * DevTools performance track, and to build its detail it **diffs the props of
 * every re-rendered component**. Any prop whose identity changed is walked to a
 * depth of 3, and the walk enumerates own keys with `for...in`.
 *
 * A `DataArchive` holds the entire raw `.dat` buffer. A `Uint8Array` has own
 * enumerable index properties, so that walk enumerates **every byte** — for
 * `ia.dat`, tens of millions of rows, twice (removed + added). The renderer
 * heap climbs to ~4 GB and V8 dies. A `DataArchiveEntry` is just as bad: it
 * back-references its archive, so the walk reaches the same buffer one level
 * deeper.
 *
 * The rule this store exists to enforce: **no `DataArchive` and no
 * `DataArchiveEntry` may appear in any prop under the Archive page.** Pass
 * indices and names; read the objects from here.
 *
 * Production is unaffected — the instrumentation is compiled out — so this is
 * purely about `npm run dev` being usable. See
 * `docs/plans/archive-preview-dev-oom.md`.
 */
interface ArchiveState {
  archive: DataArchive | null
  /** File name of the open archive (e.g. `setoa.dat`). Empty when none is open. */
  archiveName: string
  /** Sibling archives, for the manual palette dropdown. */
  auxArchives: DataArchive[]
  /** Built once per open archive; caches every palette source it touches. */
  resolver: PaletteResolver | null
  open: (archive: DataArchive, archiveName: string, siblings: Map<string, DataArchive>) => void
  close: () => void
}

export const useArchiveStore = create<ArchiveState>((set) => ({
  archive: null,
  archiveName: '',
  auxArchives: [],
  resolver: null,

  open: (archive, archiveName, siblings) => {
    // The resolver's only route to a sibling: a name, never a path — the
    // renderer has no filesystem.
    const provider: ArchiveProvider = (name) => siblings.get(name.toLowerCase()) ?? null
    set({
      archive,
      archiveName,
      auxArchives: [...siblings.values()],
      resolver: new PaletteResolver(archiveName, archive, provider)
    })
  },

  close: () => set({ archive: null, archiveName: '', auxArchives: [], resolver: null })
}))

/**
 * Resolve an entry by its index in `archive.entries`.
 *
 * The index, not the name: archives such as `album.dat` and `WorldMap.dat`
 * legitimately contain duplicate entry names, and `archive.get(name)` returns
 * only the first. An index addresses exactly one entry.
 */
export function useArchiveEntry(entryIndex: number | null): {
  archive: DataArchive | null
  entry: DataArchiveEntry | null
} {
  const archive = useArchiveStore((s) => s.archive)
  const entry = archive && entryIndex !== null ? (archive.entries[entryIndex] ?? null) : null
  return { archive, entry }
}
