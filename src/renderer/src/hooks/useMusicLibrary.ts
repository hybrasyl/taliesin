import { useState, useCallback, useEffect, useRef } from 'react'

export const MAX_TAG_LENGTH = 20

export interface MusicEntry {
  filename: string
  sizeBytes: number
  /** Numeric music ID if filename is N.mus, otherwise null */
  musicId: number | null
}

export type MusicMetaData = Record<string, MusicMeta>

/** Format seconds as M:SS (e.g. 194 → "3:14"). Returns null if not a finite number. */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !isFinite(seconds) || seconds < 0) return null
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Flatten tags that may have been stored as nested arrays by older versions of the
 * enrichment code (a bug where a music-metadata `string[]` genre got wrapped again
 * into `[[...]]`). Accepts whatever shape is in the JSON and returns a clean string[].
 */
function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  const out: string[] = []
  for (const t of tags) {
    if (typeof t === 'string') out.push(t)
    else if (Array.isArray(t)) {
      for (const inner of t) {
        if (typeof inner === 'string') out.push(inner)
      }
    }
  }
  return out
}

/**
 * In-place cleanup for a single MusicMeta entry:
 * - Normalizes tags (flattens nested arrays from old buggy writes)
 * - Tags over MAX_TAG_LENGTH are pulled out of tags[]
 * - If an overlong tag matches prompt, it's discarded (already captured)
 * - Otherwise it's appended to description
 * - If description ends up identical to prompt, description is cleared
 * Returns a new MusicMeta and a flag indicating whether anything changed.
 */
export function cleanupMeta(meta: MusicMeta): { meta: MusicMeta; changed: boolean } {
  const promptTrim = meta.prompt?.trim() || undefined
  const rawTags = normalizeTags(meta.tags)
  const wasNested = (meta.tags as unknown[] | undefined)?.some((t) => Array.isArray(t)) ?? false
  const keptTags: string[] = []
  const overflowTags: string[] = []
  for (const t of rawTags) {
    if (t.length > MAX_TAG_LENGTH) overflowTags.push(t)
    else keptTags.push(t)
  }
  let description: string | undefined = meta.description?.trim() || undefined
  for (const t of overflowTags) {
    const tt = t.trim()
    if (!tt) continue
    if (tt === promptTrim) continue
    if (description?.includes(tt)) continue
    description = description ? `${description}\n${tt}` : tt
  }
  if (description && promptTrim && description.trim() === promptTrim) {
    description = undefined
  }
  const changed =
    wasNested ||
    keptTags.length !== rawTags.length ||
    description !== (meta.description?.trim() || undefined)
  if (!changed) return { meta, changed: false }
  return {
    meta: { ...meta, tags: keptTags, description },
    changed: true,
  }
}

/**
 * Walk every entry and apply cleanupMeta. Used by the Clean up long tags button
 * for a fast in-place fix that doesn't require re-reading every MP3 from disk.
 */
export function migrateLongTagsToDescription(
  metadata: MusicMetaData
): { updated: MusicMetaData; movedCount: number } {
  const updated: MusicMetaData = {}
  let movedCount = 0
  for (const [filename, meta] of Object.entries(metadata)) {
    const { meta: cleaned, changed } = cleanupMeta(meta)
    updated[filename] = cleaned
    if (changed) movedCount++
  }
  return { updated, movedCount }
}

/**
 * Count entries needing tag cleanup: either an overlong tag, or a nested-array
 * tags field (corrupted by older enrichment code).
 */
export function countEntriesWithLongTags(metadata: MusicMetaData): number {
  let n = 0
  for (const meta of Object.values(metadata)) {
    const raw = meta.tags as unknown
    if (!Array.isArray(raw)) continue
    const hasNested = raw.some((t) => Array.isArray(t))
    const hasLong = normalizeTags(raw).some((t) => t.length > MAX_TAG_LENGTH)
    if (hasNested || hasLong) n++
  }
  return n
}

function parseFilename(filename: string): number | null {
  const basename = filename.replace(/^.*[\\/]/, '')
  const m = basename.match(/^(\d+)\.mus$/i)
  return m ? parseInt(m[1], 10) : null
}

function mergeEntries(
  scanned: MusicScanEntry[],
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

/** A track needs re-enrichment if it has no name OR no cached audio properties. */
export function needsEnrichment(meta: MusicMeta | undefined): boolean {
  if (!meta) return true
  if (!meta.name) return true
  if (meta.duration == null) return true
  return false
}

/**
 * Merge freshly-read ID3 data into an existing meta entry without clobbering user edits.
 * Audio properties and file-intrinsic fields (prompt) always overwrite; text fields only
 * fill in when the existing value is missing or empty.
 *
 * Cleanup performed on merge (so a single "Refresh all from files" heals stale data):
 * - Any tag over MAX_TAG_LENGTH is pulled out of tags[]; if it's not already captured in
 *   prompt or description, it's appended to description.
 * - If description ends up identical to prompt (stale copy from before suno_retag.py moved
 *   genre→prompt), description is cleared.
 */
function mergeEnriched(existing: MusicMeta | undefined, fresh: MusicMeta): MusicMeta {
  const e = existing ?? {}
  const prompt = fresh.prompt ?? e.prompt
  const promptTrim = prompt?.trim()

  const existingTags = normalizeTags(e.tags)
  const freshTags = normalizeTags(fresh.tags)
  const rawTags = existingTags.length > 0 ? existingTags : freshTags
  const keptTags: string[] = []
  const overflowTags: string[] = []
  for (const t of rawTags) {
    if (t.length > MAX_TAG_LENGTH) overflowTags.push(t)
    else keptTags.push(t)
  }

  let description: string | undefined = e.description?.trim() || fresh.description
  for (const t of overflowTags) {
    const tt = t.trim()
    if (!tt) continue
    if (tt === promptTrim) continue
    if (description?.includes(tt)) continue
    description = description ? `${description}\n${tt}` : tt
  }
  if (description && promptTrim && description.trim() === promptTrim) {
    description = undefined
  }

  return {
    ...e,
    name:        e.name?.trim()  || fresh.name,
    notes:       e.notes?.trim() || fresh.notes,
    description,
    tags:        keptTags,
    duration:   fresh.duration   ?? e.duration,
    bitrate:    fresh.bitrate    ?? e.bitrate,
    sampleRate: fresh.sampleRate ?? e.sampleRate,
    channels:   fresh.channels   ?? e.channels,
    prompt,
  }
}

/** Read ID3/Vorbis tags for a single file and return partial metadata, or null. */
async function readTagsForFile(dirPath: string, filename: string): Promise<MusicMeta | null> {
  const fileMeta = await window.api.musicReadFileMeta(`${dirPath}/${filename}`)
  if (!fileMeta) return null
  const result: MusicMeta = {}
  if (fileMeta.title) result.name = fileMeta.title
  if (fileMeta.genre) {
    const g = fileMeta.genre.trim()
    if (g.length > 0 && g.length <= MAX_TAG_LENGTH) {
      result.tags = [g]
    } else if (g.length > MAX_TAG_LENGTH && g !== fileMeta.prompt?.trim()) {
      // Skip if genre is just a duplicate of the prompt — already captured there
      result.description = g
    }
  }
  if (fileMeta.artist || fileMeta.album) {
    const parts = [fileMeta.artist, fileMeta.album].filter(Boolean)
    result.notes = parts.join(' — ')
  }
  if (fileMeta.duration   != null) result.duration   = fileMeta.duration
  if (fileMeta.bitrate    != null) result.bitrate    = fileMeta.bitrate
  if (fileMeta.sampleRate != null) result.sampleRate = fileMeta.sampleRate
  if (fileMeta.channels   != null) result.channels   = fileMeta.channels
  if (fileMeta.prompt)             result.prompt     = fileMeta.prompt
  return Object.keys(result).length > 0 ? result : null
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
  // Refs for draft sync after long-running enrichment
  const selectedFilenameRef = useRef(selectedFilename)
  selectedFilenameRef.current = selectedFilename
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

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
      setEntries(mergeEntries(scanned))
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
      setEntries(mergeEntries(scanned))
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
      setDraft({
        name: existing.name ?? '',
        notes: existing.notes ?? '',
        description: existing.description ?? '',
        tags: existing.tags ?? [],
      })

      // Auto-read tags if missing name or audio properties
      if (needsEnrichment(existing) && dirPath) {
        const fresh = await readTagsForFile(dirPath, filename)
        if (fresh) {
          const merged = mergeEnriched(existing, fresh)
          const newMeta = { ...metadataRef.current, [filename]: merged }
          setMetadata(newMeta)
          metadataRef.current = newMeta
          setDraft({
            name: merged.name ?? '',
            notes: merged.notes ?? '',
            description: merged.description ?? '',
            tags: merged.tags ?? [],
          })
          // Persist so we don't re-read next time
          await window.api.musicMetadataSave(dirPath, newMeta)
        }
      }
    },
    [dirPath]
  )

  // Bulk enrichment: read tags from files.
  // Default: only files missing name or audio properties.
  // { force: true }: every file (use when new ID3 frames may have been added, e.g. after
  // running suno_retag.py). Existing user edits to name/notes/description/tags are preserved.
  const enrichAll = useCallback(async (opts?: { force?: boolean }) => {
    if (!dirPath) return
    const toEnrich = opts?.force
      ? entries
      : entries.filter((e) => needsEnrichment(metadataRef.current[e.filename]))
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
          const fresh = await readTagsForFile(dirPath, e.filename)
          if (fresh) {
            updated[e.filename] = mergeEnriched(updated[e.filename], fresh)
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
      // Sync the editor's draft if the currently-selected track was updated and
      // the user has no unsaved changes (don't clobber their edits).
      const sel = selectedFilenameRef.current
      if (sel && updated[sel] && !dirtyRef.current) {
        const m = updated[sel]
        setDraft({
          name: m.name ?? '',
          notes: m.notes ?? '',
          description: m.description ?? '',
          tags: m.tags ?? [],
        })
      }
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

  const migrateLongTags = useCallback(async (): Promise<number> => {
    if (!dirPath) return 0
    const { updated, movedCount } = migrateLongTagsToDescription(metadataRef.current)
    if (movedCount === 0) return 0
    await window.api.musicMetadataSave(dirPath, updated)
    setMetadata(updated)
    metadataRef.current = updated
    // Refresh the draft if the selected track was touched
    if (selectedFilename && updated[selectedFilename]) {
      const m = updated[selectedFilename]
      setDraft({
        name: m.name ?? '',
        notes: m.notes ?? '',
        description: m.description ?? '',
        tags: m.tags ?? [],
      })
      setDirty(false)
    }
    return movedCount
  }, [dirPath, selectedFilename])

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
    migrateLongTags,
  }
}
