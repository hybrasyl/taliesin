import { useState, useCallback, useEffect } from 'react'

function newPack(name: string): MusicPack {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name,
    description: '',
    tracks: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function useMusicPacks(libraryDir: string | null) {
  const [packs, setPacks] = useState<MusicPack[]>([])
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!libraryDir) { setPacks([]); setSelectedPackId(null); return }
    setLoading(true)
    window.api.musicPacksLoad(libraryDir).then((p) => {
      setPacks(p)
      setLoading(false)
    })
  }, [libraryDir])

  const persist = useCallback(async (updated: MusicPack[]) => {
    if (!libraryDir) return
    await window.api.musicPacksSave(libraryDir, updated)
    setPacks(updated)
  }, [libraryDir])

  const createPack = useCallback(async (name: string) => {
    const pack = newPack(name)
    const updated = [...packs, pack]
    await persist(updated)
    setSelectedPackId(pack.id)
    return pack
  }, [packs, persist])

  const renamePack = useCallback(async (id: string, name: string) => {
    const updated = packs.map((p) =>
      p.id === id ? { ...p, name, updatedAt: new Date().toISOString() } : p
    )
    await persist(updated)
  }, [packs, persist])

  const setDescription = useCallback(async (id: string, description: string) => {
    const updated = packs.map((p) =>
      p.id === id ? { ...p, description, updatedAt: new Date().toISOString() } : p
    )
    await persist(updated)
  }, [packs, persist])

  const deletePack = useCallback(async (id: string) => {
    const updated = packs.filter((p) => p.id !== id)
    await persist(updated)
    if (selectedPackId === id) setSelectedPackId(updated[0]?.id ?? null)
  }, [packs, persist, selectedPackId])

  const addTrack = useCallback(async (packId: string, sourceFile: string, musicId: number) => {
    const updated = packs.map((p) => {
      if (p.id !== packId) return p
      if (p.tracks.some((t) => t.sourceFile === sourceFile)) return p
      return {
        ...p,
        tracks: [...p.tracks, { musicId, sourceFile }],
        updatedAt: new Date().toISOString(),
      }
    })
    await persist(updated)
  }, [packs, persist])

  const removeTrack = useCallback(async (packId: string, sourceFile: string) => {
    const updated = packs.map((p) =>
      p.id !== packId ? p : {
        ...p,
        tracks: p.tracks.filter((t) => t.sourceFile !== sourceFile),
        updatedAt: new Date().toISOString(),
      }
    )
    await persist(updated)
  }, [packs, persist])

  const reorderTracks = useCallback(async (packId: string, tracks: MusicPackTrack[]) => {
    const updated = packs.map((p) =>
      p.id !== packId ? p : { ...p, tracks, updatedAt: new Date().toISOString() }
    )
    await persist(updated)
  }, [packs, persist])

  const updateTrackId = useCallback(async (packId: string, sourceFile: string, musicId: number) => {
    const updated = packs.map((p) =>
      p.id !== packId ? p : {
        ...p,
        tracks: p.tracks.map((t) => t.sourceFile === sourceFile ? { ...t, musicId } : t),
        updatedAt: new Date().toISOString(),
      }
    )
    await persist(updated)
  }, [packs, persist])

  const deployPack = useCallback(async (packId: string, srcLibDir: string, destDir: string, ffmpegPath: string | null, kbps: number, sampleRate: number) => {
    const pack = packs.find((p) => p.id === packId)
    if (!pack) throw new Error(`Pack ${packId} not found`)
    await window.api.musicDeployPack(srcLibDir, pack, destDir, ffmpegPath, kbps, sampleRate)
  }, [packs])

  const selectedPack = packs.find((p) => p.id === selectedPackId) ?? null

  return {
    packs,
    selectedPack,
    selectedPackId,
    loading,
    setSelectedPackId,
    createPack,
    renamePack,
    setDescription,
    deletePack,
    addTrack,
    removeTrack,
    reorderTracks,
    updateTrackId,
    deployPack,
  }
}
