import { useState, useCallback, useEffect } from 'react'

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
    // meta is used externally; we keep it merged in the hook return, not embedded here
    .map((e) => ({ ...e, ...(meta[e.filename] ? {} : {}) }))
}

export function useMusicLibrary(dirPath: string | null) {
  const [entries, setEntries] = useState<MusicEntry[]>([])
  const [metadata, setMetadata] = useState<MusicMetaData>({})
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null)
  const [draft, setDraft] = useState<MusicMeta>({})
  const [dirty, setDirty] = useState(false)
  const [scanning, setScanning] = useState(false)

  // Auto-scan when dirPath is set or changes
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
    ]).then(async ([scanned, existingMeta]) => {
      // For files with no name yet, try to read ID3/Vorbis tags
      const enriched = { ...existingMeta }
      let anyNew = false
      await Promise.all(
        scanned
          .filter((e) => !enriched[e.filename]?.name)
          .map(async (e) => {
            const fileMeta = await window.api.musicReadFileMeta(`${dirPath}/${e.filename}`)
            if (!fileMeta) return
            const tags: MusicMeta = {}
            if (fileMeta.title)  tags.name  = fileMeta.title
            if (fileMeta.genre)  tags.tags  = [fileMeta.genre]
            if (fileMeta.artist || fileMeta.album) {
              const parts = [fileMeta.artist, fileMeta.album].filter(Boolean)
              tags.notes = parts.join(' — ')
            }
            if (Object.keys(tags).length > 0) {
              enriched[e.filename] = { ...(enriched[e.filename] ?? {}), ...tags }
              anyNew = true
            }
          })
      )
      if (anyNew) {
        await window.api.musicMetadataSave(dirPath, enriched)
      }
      setMetadata(enriched)
      setEntries(mergeEntries(scanned, enriched))
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
      const enriched = { ...existingMeta }
      let anyNew = false
      await Promise.all(
        scanned
          .filter((e) => !enriched[e.filename]?.name)
          .map(async (e) => {
            const fileMeta = await window.api.musicReadFileMeta(`${dirPath}/${e.filename}`)
            if (!fileMeta) return
            const tags: MusicMeta = {}
            if (fileMeta.title)  tags.name  = fileMeta.title
            if (fileMeta.genre)  tags.tags  = [fileMeta.genre]
            if (fileMeta.artist || fileMeta.album) {
              const parts = [fileMeta.artist, fileMeta.album].filter(Boolean)
              tags.notes = parts.join(' — ')
            }
            if (Object.keys(tags).length > 0) {
              enriched[e.filename] = { ...(enriched[e.filename] ?? {}), ...tags }
              anyNew = true
            }
          })
      )
      if (anyNew) await window.api.musicMetadataSave(dirPath, enriched)
      setMetadata(enriched)
      setEntries(mergeEntries(scanned, enriched))
    } finally {
      setScanning(false)
    }
  }, [dirPath])

  const select = useCallback(
    (filename: string | null) => {
      setSelectedFilename(filename)
      setDirty(false)
      if (!filename) { setDraft({}); return }
      const m = metadata[filename] ?? {}
      setDraft({ name: m.name ?? '', notes: m.notes ?? '', tags: m.tags ?? [] })
    },
    [metadata]
  )

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
    scan,
    select,
    updateDraft,
    save,
  }
}
