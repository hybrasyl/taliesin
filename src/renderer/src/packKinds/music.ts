import { z } from 'zod'
import type { AddAssetOptions, AssetTargetPath, PackAsset, PackKind, SlotIdentity } from './types'

// Matches the Brigid client's MusicPack contract: music_{id}.{ext} at the zip
// root, id is the integer SoundArgs.Sound (zero-pad tolerated on read).
const MUSIC_RE = /^music_(\d+)\.(ogg|mp3|wav|flac|mus)$/i
const AUDIO_EXTENSIONS = ['ogg', 'mp3', 'wav', 'flac', 'mus']

const coversSchema = z.object({
  music: z.record(z.string(), z.unknown())
})

function parseSlot(relPath: string): SlotIdentity | null {
  const m = MUSIC_RE.exec(relPath)
  if (!m) return null
  return { namespace: 'music', id: parseInt(m[1], 10) }
}

function nextId(existing: PackAsset[]): number {
  let max = 0
  for (const a of existing) {
    const slot = parseSlot(a.filename)
    if (slot && slot.id > max) max = slot.id
  }
  return max + 1
}

export const musicKind: PackKind = {
  type: 'music',
  label: 'Music',
  description:
    'Background music tracks (ogg/mp3/wav/flac/mus), one per music ID. Overrides the legacy loose .mus files; ogg recommended.',
  fileExtensions: AUDIO_EXTENSIONS,
  defaultCovers: () => ({ music: {} }),
  coversSchema,
  parseSlot,
  nextAssetPath({ existingAssets, sourceExtension }: AddAssetOptions): AssetTargetPath {
    const id = nextId(existingAssets)
    const ext =
      sourceExtension && AUDIO_EXTENSIONS.includes(sourceExtension) ? sourceExtension : 'ogg'
    const filename = `music_${String(id).padStart(4, '0')}.${ext}`
    return { zipPath: filename, relPath: filename }
  }
}
