import { z } from 'zod'
import type { AddAssetOptions, AssetTargetPath, PackAsset, PackKind, SlotIdentity } from './types'

// Matches the Brigid client's SfxPack contract: sfx_{id}.{ext} at the zip root,
// id is the integer SoundArgs.Sound (matches legacy legend.dat {id}.mp3 numbering).
const SFX_RE = /^sfx_(\d+)\.(wav|ogg|mp3|flac)$/i
const AUDIO_EXTENSIONS = ['wav', 'ogg', 'mp3', 'flac']

const coversSchema = z.object({
  sound_effects: z.record(z.string(), z.unknown())
})

function parseSlot(relPath: string): SlotIdentity | null {
  const m = SFX_RE.exec(relPath)
  if (!m) return null
  return { namespace: 'sfx', id: parseInt(m[1], 10) }
}

function nextId(existing: PackAsset[]): number {
  let max = 0
  for (const a of existing) {
    const slot = parseSlot(a.filename)
    if (slot && slot.id > max) max = slot.id
  }
  return max + 1
}

export const soundEffectsKind: PackKind = {
  type: 'sound_effects',
  label: 'Sound Effects',
  description:
    'Short sound-effect clips (wav/ogg/mp3/flac), one per sound ID. Overrides legend.dat sounds; wav or ogg recommended.',
  fileExtensions: AUDIO_EXTENSIONS,
  defaultCovers: () => ({ sound_effects: {} }),
  coversSchema,
  parseSlot,
  nextAssetPath({ existingAssets, sourceExtension }: AddAssetOptions): AssetTargetPath {
    const id = nextId(existingAssets)
    const ext =
      sourceExtension && AUDIO_EXTENSIONS.includes(sourceExtension) ? sourceExtension : 'wav'
    const filename = `sfx_${String(id).padStart(4, '0')}.${ext}`
    return { zipPath: filename, relPath: filename }
  }
}
