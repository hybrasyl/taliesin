import { z } from 'zod'
import type { AddAssetOptions, AssetTargetPath, PackKind, PackProject, SlotIdentity } from './types'
import { nextSlotId } from './helpers'

// Matches the Brigid client's AmbientPack contract: amb_{id}.{ext} at the zip
// root, decoded like SFX rather than streamed like music, because the ambient
// bed plays on a mixer channel and has to coexist with the single music stream.
// The id is the server-sent ambient id (Map/@AmbientSound, an unsignedByte
// where 0 means "no ambient").
const AMB_RE = /^amb_(\d+)\.(wav|ogg|mp3|flac)$/i
const AUDIO_EXTENSIONS = ['wav', 'ogg', 'mp3', 'flac']

/**
 * `covers.ambient_sounds` is a MAP KEYED BY ID, not a list of flagged ids, and
 * that shape is the contract rather than a style choice. v1 carries one field:
 *
 *   { "1": { "loop": true } }
 *
 * Interval scheduling is deferred in the client, and keying by id is what lets
 * it arrive without a schema bump:
 *
 *   { "1": { "mode": "interval", "play": 180, "silence": 120 } }
 *
 * The deferred fields are declared here as optional so that a pack authored by
 * a later Taliesin still validates against this one instead of failing to open.
 * Nothing in this version writes them — see `assetMetaFields` below.
 */
const entrySchema = z.object({
  loop: z.boolean().optional(),
  // Deferred (BRIG-16): read by the client only if the interval scheduler is
  // built. Accepted, never authored here.
  mode: z.literal('interval').optional(),
  play: z.number().int().positive().optional(),
  silence: z.number().int().positive().optional()
})

const coversSchema = z.object({
  ambient_sounds: z.record(z.string(), entrySchema)
})

function parseSlot(relPath: string): SlotIdentity | null {
  const m = AMB_RE.exec(relPath)
  if (!m) return null
  return { namespace: 'amb', id: parseInt(m[1], 10) }
}

export const ambientSoundsKind: PackKind = {
  type: 'ambient_sounds',
  label: 'Ambient Sounds',
  description:
    'Looping ambient beds (wav/ogg/mp3/flac), one per ambient ID. Driven by a map’s AmbientSound field; ID 0 means no ambient, so IDs start at 1.',
  fileExtensions: AUDIO_EXTENSIONS,
  defaultCovers: () => ({ ambient_sounds: {} }),
  coversSchema,
  parseSlot,
  nextAssetPath({ existingAssets, sourceExtension }: AddAssetOptions): AssetTargetPath {
    const id = nextSlotId(existingAssets, parseSlot)
    const ext =
      sourceExtension && AUDIO_EXTENSIONS.includes(sourceExtension) ? sourceExtension : 'wav'
    const filename = `amb_${String(id).padStart(4, '0')}.${ext}`
    return { zipPath: filename, relPath: filename }
  },
  assetMetaFields: () => ({
    loop: {
      kind: 'boolean',
      label: 'Loop',
      help: 'Play this bed continuously. The only playback field in v1; interval scheduling is deferred.'
    }
  }),
  reduceCoversFromMeta(draft: PackProject) {
    const meta = draft.assetMeta ?? {}
    const entries: Record<string, { loop: true }> = {}
    for (const asset of draft.assets) {
      if (meta[asset.filename]?.loop !== true) continue
      const slot = parseSlot(asset.filename)
      // Keyed by the numeric id, NOT the filename: the client looks the entry up
      // by the ambient id the server sent, and never sees the zip-relative name.
      if (slot) entries[String(slot.id)] = { loop: true }
    }
    return { ambient_sounds: entries }
  }
}
