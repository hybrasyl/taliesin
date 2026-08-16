import { useState, useCallback, useEffect, useRef } from 'react'
import { HYBRASYL_NS } from '../utils/xmlUtils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CatalogMeta {
  name?: string
  notes?: string
  width?: number
  height?: number
}

export type CatalogData = Record<string, CatalogMeta>

/** A fully merged entry — scan data + catalog metadata. */
export interface CatalogEntry {
  filename: string
  /** The id in the name, or null when the name carries none (`rudin001.map`). */
  mapNumber: number | null
  variant: string | null // null = canonical; "d0799701" or "kyle" = variant
  /** What the row shows: `lod500` for a named id, else the filename stem. */
  label: string
  sizeBytes: number
  name: string
  notes: string
  width: number | null
  height: number | null
}

// ── Filename parsing ──────────────────────────────────────────────────────────

export interface ParsedMapName {
  /** The id the name states, or null when it states none. */
  mapNumber: number | null
  /** What distinguishes this file from the bare id. */
  variant: string | null
  /** Row label: `lod500` when the name names an id, else the filename stem. */
  label: string
}

/**
 * Read what a `.map` filename says about itself.
 *
 * **Every `.map` file is a map.** This used to demand `lod<digits>[-variant].map`
 * and return null otherwise, and `mergeEntries` dropped whatever it refused —
 * silently. In `E:\Hybrasyl Dev\Maps\LOD 8.x Maps` that hid 1036 of 2690 files:
 * 1007 Windows copy-duplicates (`lod0001 (2).map`), underscore variants
 * (`lod505_1.map`), Korean-titled maps carrying no digits at all, other prefixes
 * (`nova0001.map`, `rudin001.map`), and a bare `214214.map`. All of them load and
 * render; only the name was unusual.
 *
 * So the name is now read for what it offers and never used to exclude. A name
 * with no id parses to `mapNumber: null`, which costs the entry its index lookup
 * and its export default — not its place in the catalog.
 *
 * Digits are NOT scraped out of an unknown prefix: `nova0001.map` would land
 * among the lod1s and claim to be map 1, which is a worse answer than "no id".
 */
export function parseMapFilename(filename: string): ParsedMapName | null {
  const stem = filename.replace(/\.map$/i, '')
  if (stem === filename) return null // not a .map file at all

  // `lod500`, `lod500-summer`, `lod0001 (2)`, `lod505_1`, `lod15500(...)`.
  const lod = stem.match(/^lod(\d+)(.*)$/i)
  if (lod) {
    const rest = lod[2].replace(/^[-_\s]+/, '').trim()
    return {
      mapNumber: parseInt(lod[1], 10),
      variant: rest || null,
      label: `lod${parseInt(lod[1], 10)}`
    }
  }

  // A bare number is an id without the prefix. Labelled as written, because
  // calling `214214.map` "lod214214" asserts more than the name does.
  const bare = stem.match(/^(\d+)$/)
  if (bare) {
    return { mapNumber: parseInt(bare[1], 10), variant: null, label: stem }
  }

  return { mapNumber: null, variant: null, label: stem }
}

function mergeEntries(
  scanned: { filename: string; sizeBytes: number }[],
  catalog: CatalogData
): CatalogEntry[] {
  const entries: CatalogEntry[] = []
  for (const s of scanned) {
    const parsed = parseMapFilename(s.filename)
    if (!parsed) continue
    const meta = catalog[s.filename] ?? {}
    entries.push({
      filename: s.filename,
      mapNumber: parsed.mapNumber,
      variant: parsed.variant,
      label: parsed.label,
      sizeBytes: s.sizeBytes,
      name: meta.name ?? '',
      notes: meta.notes ?? '',
      width: meta.width ?? null,
      height: meta.height ?? null
    })
  }
  // Map number asc, canonical (no variant) first within each number. Names that
  // state no id sort together at the end, alphabetically — they have nothing to
  // interleave on, and burying them among the numbers would only hide them
  // differently.
  entries.sort((a, b) => {
    if (a.mapNumber === null || b.mapNumber === null) {
      if (a.mapNumber !== b.mapNumber) return a.mapNumber === null ? 1 : -1
      return a.label.localeCompare(b.label)
    }
    if (a.mapNumber !== b.mapNumber) return a.mapNumber - b.mapNumber
    if (a.variant === null && b.variant !== null) return -1
    if (a.variant !== null && b.variant === null) return 1
    return (a.variant ?? '').localeCompare(b.variant ?? '')
  })
  return entries
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCatalog(dirPath: string | null) {
  const [entries, setEntries] = useState<CatalogEntry[]>([])
  const [catalog, setCatalog] = useState<CatalogData>({})
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Draft state for the currently selected entry
  const [draft, setDraft] = useState<CatalogMeta>({})

  /**
   * Which load is current. Bumped by every `rescan` and by every `dirPath`
   * change, so a reply from the directory the user just left cannot land on top
   * of the one they switched to — the two loads race whenever a source is
   * switched while the first is still in flight.
   */
  const loadSeq = useRef(0)

  /**
   * Read the directory listing and the catalog metadata, and merge them.
   *
   * This is how the page loads, not a user action — the button below is a
   * *re*scan, for files added on disk since. The listing is one IPC call
   * returning `{ filename, sizeBytes }`, which is cheap enough not to gate
   * behind a click, and the page shows nothing at all without it (HTOO-353).
   */
  const rescan = useCallback(async () => {
    if (!dirPath) return
    const seq = ++loadSeq.current
    setScanning(true)
    try {
      const [scanned, catalogData] = await Promise.all([
        window.api.catalogScan(dirPath),
        window.api.catalogLoad(dirPath).then((r) => r as CatalogData)
      ])
      if (seq !== loadSeq.current) return
      setCatalog(catalogData)
      setEntries(mergeEntries(scanned, catalogData))
    } finally {
      if (seq === loadSeq.current) setScanning(false)
    }
  }, [dirPath])

  /**
   * Drop everything belonging to the previous source, DURING RENDER.
   *
   * The selection cannot survive a source change: filenames repeat across map
   * directories — `lod00500.map` exists in most of them — so carrying
   * `selectedFilename` across would rebind the editor to a different map with
   * the same name.
   *
   * Clearing it in an effect was not enough, and the reason is React's effect
   * order: children run before parents. On a switch, MapCatalogEditor's
   * file-load effect (keyed on dirPath + filename) fired first, with the NEW
   * directory and the OLD entry still in hand, and read a path that cannot
   * exist — `world/mapfiles/lod301-e86b8d…map`, a variant from the source just
   * left. The read failed into its own catch, so the UI looked fine and the
   * console filled with ENOENT.
   *
   * Adjusting state during render is React's documented answer to "reset when a
   * prop changes". It lands before children render, so the editor unmounts with
   * the stale entry instead of reading for it. `entries` goes too — showing the
   * old source's rows under the new source's name was its own small lie.
   */
  const lastDir = useRef(dirPath)
  if (lastDir.current !== dirPath) {
    lastDir.current = dirPath
    loadSeq.current++ // discard any load still in flight for the old directory
    setEntries([])
    setCatalog({})
    setSelectedFilename(null)
    setDraft({})
    setDirty(false)
  }

  // Load on open, and reload on every source change.
  useEffect(() => {
    if (!dirPath) return
    void rescan()
  }, [dirPath, rescan])

  // Re-merge entries when catalog changes (e.g. after save)
  const refreshEntries = useCallback(
    (newCatalog: CatalogData, scanned?: { filename: string; sizeBytes: number }[]) => {
      if (scanned) {
        setEntries(mergeEntries(scanned, newCatalog))
      } else {
        setEntries((prev) =>
          mergeEntries(
            prev.map((e) => ({ filename: e.filename, sizeBytes: e.sizeBytes })),
            newCatalog
          )
        )
      }
    },
    []
  )

  // Select an entry and populate the draft
  const select = useCallback(
    (filename: string | null) => {
      setSelectedFilename(filename)
      setDirty(false)
      if (!filename) {
        setDraft({})
        return
      }
      const entry = entries.find((e) => e.filename === filename)
      setDraft({
        name: entry?.name ?? '',
        notes: entry?.notes ?? '',
        width: entry?.width ?? undefined,
        height: entry?.height ?? undefined
      })
    },
    [entries]
  )

  const updateDraft = useCallback((changes: Partial<CatalogMeta>) => {
    setDraft((prev) => ({ ...prev, ...changes }))
    setDirty(true)
  }, [])

  // Save the draft for the selected entry.
  // Pass `overrides` to merge extra fields atomically (avoids React state timing issues).
  const save = useCallback(
    async (overrides?: Partial<CatalogMeta>) => {
      if (!dirPath || !selectedFilename) return
      const merged = overrides ? { ...draft, ...overrides } : draft
      const newCatalog: CatalogData = {
        ...catalog,
        [selectedFilename]: {
          ...(catalog[selectedFilename] ?? {}),
          ...merged
        }
      }
      await window.api.catalogSave(dirPath, newCatalog)
      setCatalog(newCatalog)
      refreshEntries(newCatalog)
      if (overrides) setDraft((prev) => ({ ...prev, ...overrides }))
      setDirty(false)
    },
    [dirPath, selectedFilename, catalog, draft, refreshEntries]
  )

  // Append a note to the selected entry (used after export)
  const appendNote = useCallback(
    async (filename: string, note: string) => {
      if (!dirPath) return
      const existing = catalog[filename] ?? {}
      const existingNotes = existing.notes ?? ''
      const newNotes = existingNotes ? `${existingNotes}\n${note}` : note
      const newCatalog: CatalogData = {
        ...catalog,
        [filename]: { ...existing, notes: newNotes }
      }
      await window.api.catalogSave(dirPath, newCatalog)
      setCatalog(newCatalog)
      refreshEntries(newCatalog)
      // If this entry is currently selected, update the draft notes too
      if (selectedFilename === filename) {
        setDraft((prev) => ({ ...prev, notes: newNotes }))
      }
    },
    [dirPath, catalog, selectedFilename, refreshEntries]
  )

  const selectedEntry = entries.find((e) => e.filename === selectedFilename) ?? null

  return {
    entries,
    selectedEntry,
    selectedFilename,
    draft,
    dirty,
    scanning,
    rescan,
    select,
    updateDraft,
    save,
    appendNote
  }
}

// ── Export helpers ────────────────────────────────────────────────────────────

// xmlPrefix (the lod/hyb 30000 rule) lives in data/mapData; re-exported here for
// existing importers (MapExportDialog, tests).
export { xmlPrefix } from '../data/mapData'

/**
 * Derive world name from library path (world/xml/).
 * The repo name is 2 levels up: world/xml → world → reponame.
 */
export function worldName(libraryPath: string): string {
  const parts = libraryPath
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .filter(Boolean)
  return parts[parts.length - 3] ?? parts[parts.length - 1] ?? libraryPath
}

/** Build a minimal Hybrasyl Map XML stub. */
export function buildMapXmlStub(
  mapNumber: number,
  name: string,
  width: number,
  height: number
): string {
  const safeName = name
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return `<?xml version="1.0" encoding="utf-8"?>
<Map xmlns="${HYBRASYL_NS}" Id="${mapNumber}" Name="${safeName}" X="${width}" Y="${height}">
</Map>
`
}
