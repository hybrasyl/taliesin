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
 *   { "1": { "loop": false } }
 *
 * LOOPING IS THE DEFAULT (BRIG-16, decided 2026-08-10). A missing entry means
 * the client loops the bed — it starts it with Mix_PlayChannel(…, -1) and reads
 * the flag as `entry?.loop != false`. So only one-shots are written down, the
 * same way `item_icons` writes only `no_dye`. `{ "loop": true }` stays legal to
 * read, and nothing here writes it.
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
  // A NEGATIVE flag, like item_icons' no_dye, because the default is to loop.
  // It also keeps PackEditor untouched: it draws a boolean as
  // `checked={assetMeta[key] === true}`, so unchecked-by-default is the only
  // state it can render without an AssetMetaField default.
  assetMetaFields: () => ({
    no_loop: {
      kind: 'boolean',
      label: 'One-shot',
      help: 'Play this bed once instead of looping. Beds loop unless you check this; interval scheduling is deferred.'
    }
  }),
  reduceCoversFromMeta(draft: PackProject) {
    const meta = draft.assetMeta ?? {}
    const entries: Record<string, { loop: false }> = {}
    for (const asset of draft.assets) {
      if (meta[asset.filename]?.no_loop !== true) continue
      const slot = parseSlot(asset.filename)
      // Keyed by the numeric id, NOT the filename: the client looks the entry up
      // by the ambient id the server sent, and never sees the zip-relative name.
      if (slot) entries[String(slot.id)] = { loop: false }
    }
    return { ambient_sounds: entries }
  }
}
