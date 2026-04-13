import { useState, useCallback, useEffect, useRef } from 'react'

export interface MusicEntry {
  filename: string
  sizeBytes: number
  /** Numeric music ID if filename is N.mus, otherwise null */
  musicId: number | null
}

export type MusicMetaData = Record<string, MusicMeta>

function parseFilename(filename: string): number | null {
  const basename = filename.replace(/^.*[\\/]/, '')
  const m = basename.match(/^(\d+)\.mus$/i)
  return m ? parseInt(m[1], 10) : null
}

function mergeEntries(
  scanned: MusicScanEntry[],
  meta: MusicMetaData
): MusicEntry[] {
  return scanned
    .map((s) => ({
      filename: s.filename,
      sizeBytes: s.sizeBytes,
      musicId: parseFilename(s.filename),
    }))
    .sort((a, b) => {
      // Numeric .mus files sort by ID, others sort alpha after
      if (a.musicId !== null && b.musicId !== null) return a.musicId - b.musicId
      if (a.musicId !== null) return -1
      if (b.musicId !== null) return 1
      return a.filename.localeCompare(b.filename)
    })
}

/** Read ID3/Vorbis tags for a single file and return partial metadata, or null. */
async function readTagsForFile(dirPath: string, filename: string): Promise<MusicMeta | null> {
  const fileMeta = await window.api.musicReadFileMeta(`${dirPath}/${filename}`)
  if (!fileMeta) return null
  const tags: MusicMeta = {}
  if (fileMeta.title)  tags.name  = fileMeta.title
  if (fileMeta.genre)  tags.tags  = [fileMeta.genre]
  if (fileMeta.artist || fileMeta.album) {
    const parts = [fileMeta.artist, fileMeta.album].filter(Boolean)
    tags.notes = parts.join(' — ')
  }
  return Object.keys(tags).length > 0 ? tags : null
}

export function useMusicLibrary(dirPath: string | null) {
  const [entries, setEntries] = useState<MusicEntry[]>([])
  const [metadata, setMetadata] = useState<MusicMetaData>({})
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null)
  const [draft, setDraft] = useState<MusicMeta>({})
  const [dirty, setDirty] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [enrichProgress, setEnrichProgress] = useState<{ done: number; total: number } | null>(null)

  // Keep a ref to metadata so async callbacks always see the latest
  const metadataRef = useRef(metadata)
  metadataRef.current = metadata

  // Auto-scan when dirPath is set or changes — NO tag enrichment
  useEffect(() => {
    if (!dirPath) {
      setEntries([])
      setMetadata({})
      setSelectedFilename(null)
      return
    }
    setScanning(true)
    Promise.all([
      window.api.musicScan(dirPath),
      window.api.musicMetadataLoad(dirPath).then((r) => r as MusicMetaData),
    ]).then(([scanned, existingMeta]) => {
      setMetadata(existingMeta)
      setEntries(mergeEntries(scanned, existingMeta))
    }).finally(() => setScanning(false))
  }, [dirPath])

  const scan = useCallback(async () => {
    if (!dirPath) return
    setScanning(true)
    try {
      const [scanned, existingMeta] = await Promise.all([
        window.api.musicScan(dirPath),
        window.api.musicMetadataLoad(dirPath).then((r) => r as MusicMetaData),
      ])
      setMetadata(existingMeta)
      setEntries(mergeEntries(scanned, existingMeta))
    } finally {
      setScanning(false)
    }
  }, [dirPath])

  // Lazy enrichment: read tags for a single file on selection if it has no name
  const select = useCallback(
    async (filename: string | null) => {
      setSelectedFilename(filename)
      setDirty(false)
      if (!filename) { setDraft({}); return }

      const existing = metadataRef.current[filename] ?? {}
      setDraft({ name: existing.name ?? '', notes: existing.notes ?? '', tags: existing.tags ?? [] })

      // If no name yet, try to auto-read tags from the file
      if (!existing.name && dirPath) {
        const tags = await readTagsForFile(dirPath, filename)
        if (tags) {
          const merged = { ...existing, ...tags }
          const newMeta = { ...metadataRef.current, [filename]: merged }
          setMetadata(newMeta)
          metadataRef.current = newMeta
          setDraft({ name: merged.name ?? '', notes: merged.notes ?? '', tags: merged.tags ?? [] })
          // Persist so we don't re-read next time
          await window.api.musicMetadataSave(dirPath, newMeta)
        }
      }
    },
    [dirPath]
  )

  // Bulk enrichment: read tags for all files that lack a name, with progress
  const enrichAll = useCallback(async () => {
    if (!dirPath) return
    const toEnrich = entries.filter((e) => !metadataRef.current[e.filename]?.name)
    if (toEnrich.length === 0) return

    setEnrichProgress({ done: 0, total: toEnrich.length })
    const updated = { ...metadataRef.current }
    let anyNew = false
    // Process in batches of 10 to keep the UI responsive
    const BATCH = 10
    for (let i = 0; i < toEnrich.length; i += BATCH) {
      const batch = toEnrich.slice(i, i + BATCH)
      await Promise.all(
        batch.map(async (e) => {
          const tags = await readTagsForFile(dirPath, e.filename)
          if (tags) {
            updated[e.filename] = { ...(updated[e.filename] ?? {}), ...tags }
            anyNew = true
          }
        })
      )
      setEnrichProgress({ done: Math.min(i + BATCH, toEnrich.length), total: toEnrich.length })
    }
    if (anyNew) {
      await window.api.musicMetadataSave(dirPath, updated)
      setMetadata(updated)
      metadataRef.current = updated
    }
    setEnrichProgress(null)
  }, [dirPath, entries])

  const remove = useCallback(async (filename: string) => {
    if (!dirPath) return
    // Delete the file from the library directory
    await window.api.deleteFile(`${dirPath}/${filename}`)
    // Remove from metadata and persist
    const { [filename]: _, ...rest } = metadataRef.current
    await window.api.musicMetadataSave(dirPath, rest)
    setMetadata(rest)
    metadataRef.current = rest
    // Remove from entries list
    setEntries((prev) => prev.filter((e) => e.filename !== filename))
    // Deselect if this was the selected track
    if (selectedFilename === filename) {
      setSelectedFilename(null)
      setDraft({})
      setDirty(false)
    }
  }, [dirPath, selectedFilename])

  const updateDraft = useCallback((changes: Partial<MusicMeta>) => {
    setDraft((prev) => ({ ...prev, ...changes }))
    setDirty(true)
  }, [])

  const save = useCallback(async (overrides?: Partial<MusicMeta>) => {
    if (!dirPath || !selectedFilename) return
    const merged = overrides ? { ...draft, ...overrides } : draft
    const newMeta: MusicMetaData = {
      ...metadata,
      [selectedFilename]: { ...(metadata[selectedFilename] ?? {}), ...merged },
    }
    await window.api.musicMetadataSave(dirPath, newMeta)
    setMetadata(newMeta)
    metadataRef.current = newMeta
    if (overrides) setDraft((prev) => ({ ...prev, ...overrides }))
    setDirty(false)
  }, [dirPath, selectedFilename, metadata, draft])

  const selectedEntry = entries.find((e) => e.filename === selectedFilename) ?? null
  const selectedMeta  = selectedFilename ? (metadata[selectedFilename] ?? {}) : null

  return {
    entries,
    metadata,
    selectedEntry,
    selectedMeta,
    selectedFilename,
    draft,
    dirty,
    scanning,
    enrichProgress,
    scan,
    select,
    remove,
    updateDraft,
    save,
    enrichAll,
  }
}
