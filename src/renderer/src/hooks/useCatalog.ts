import { useState, useCallback, useEffect } from 'react'

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
  mapNumber: number
  variant: string | null   // null = canonical; "d0799701" or "kyle" = variant
  sizeBytes: number
  name: string
  notes: string
  width: number | null
  height: number | null
}

// ── Filename parsing ──────────────────────────────────────────────────────────

export function parseMapFilename(filename: string): { mapNumber: number; variant: string | null } | null {
  const match = filename.match(/^lod(\d+)(?:-([^.]+))?\.map$/i)
  if (!match) return null
  return {
    mapNumber: parseInt(match[1], 10),
    variant: match[2] ?? null,
  }
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
      sizeBytes: s.sizeBytes,
      name: meta.name ?? '',
      notes: meta.notes ?? '',
      width: meta.width ?? null,
      height: meta.height ?? null,
    })
  }
  // Sort by map number asc, canonical (no variant) first within each number
  entries.sort((a, b) => {
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

  // Load catalog from disk when dirPath changes
  useEffect(() => {
    if (!dirPath) {
      setEntries([])
      setCatalog({})
      setSelectedFilename(null)
      return
    }
    window.api.catalogLoad(dirPath).then((raw) => {
      const data = raw as CatalogData
      setCatalog(data)
    })
  }, [dirPath])

  // Scan the directory for .map files
  const scan = useCallback(async () => {
    if (!dirPath) return
    setScanning(true)
    try {
      const [scanned, catalogData] = await Promise.all([
        window.api.catalogScan(dirPath),
        window.api.catalogLoad(dirPath).then((r) => r as CatalogData),
      ])
      setCatalog(catalogData)
      setEntries(mergeEntries(scanned, catalogData))
    } finally {
      setScanning(false)
    }
  }, [dirPath])

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
        height: entry?.height ?? undefined,
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
  const save = useCallback(async (overrides?: Partial<CatalogMeta>) => {
    if (!dirPath || !selectedFilename) return
    const merged = overrides ? { ...draft, ...overrides } : draft
    const newCatalog: CatalogData = {
      ...catalog,
      [selectedFilename]: {
        ...(catalog[selectedFilename] ?? {}),
        ...merged,
      },
    }
    await window.api.catalogSave(dirPath, newCatalog)
    setCatalog(newCatalog)
    refreshEntries(newCatalog)
    if (overrides) setDraft((prev) => ({ ...prev, ...overrides }))
    setDirty(false)
  }, [dirPath, selectedFilename, catalog, draft, refreshEntries])

  // Append a note to the selected entry (used after export)
  const appendNote = useCallback(
    async (filename: string, note: string) => {
      if (!dirPath) return
      const existing = catalog[filename] ?? {}
      const existingNotes = existing.notes ?? ''
      const newNotes = existingNotes ? `${existingNotes}\n${note}` : note
      const newCatalog: CatalogData = {
        ...catalog,
        [filename]: { ...existing, notes: newNotes },
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
    scan,
    select,
    updateDraft,
    save,
    appendNote,
  }
}

// ── Export helpers ────────────────────────────────────────────────────────────

/** Derive lod/hyb prefix from map number. */
export function xmlPrefix(mapNumber: number): 'lod' | 'hyb' {
  return mapNumber >= 30000 ? 'hyb' : 'lod'
}

/**
 * Derive world name from library path (world/xml/).
 * The repo name is 2 levels up: world/xml → world → reponame.
 */
export function worldName(libraryPath: string): string {
  const parts = libraryPath.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 3] ?? parts[parts.length - 1] ?? libraryPath
}

/** Build a minimal Hybrasyl Map XML stub. */
export function buildMapXmlStub(
  mapNumber: number,
  name: string,
  width: number,
  height: number
): string {
  const safeName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return `<?xml version="1.0" encoding="utf-8"?>
<Map xmlns="http://www.hybrasyl.com/XML/Hybrasyl/2020-02" Id="${mapNumber}" Name="${safeName}" X="${width}" Y="${height}">
</Map>
`
}
