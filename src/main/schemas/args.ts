import { z } from 'zod'

/**
 * Schemas for the IPC payloads that are ARGUMENTS rather than documents.
 *
 * The sibling files in this directory each describe one saved artefact — a
 * pack project, a palette, a theme — and are parsed by the handler that writes
 * that artefact to disk. The channels here take no document: they take bytes, a
 * list of paths, dialog options, encode parameters. They were the remainder
 * after the save-side sweep, and they matter for a different reason.
 *
 * A malformed DOCUMENT is usually caught downstream, because something later
 * reads a field that is not there. A malformed ARGUMENT is not: `fs.writeFile`
 * given an object writes the string "[object Object]" and reports success, and
 * `${kbps}k` given undefined hands ffmpeg "undefinedk". Those fail silently or
 * far from the cause, which is exactly the robustness gap HTOO-162 describes.
 */

/** One entry of an Electron file-dialog filter list. */
const fileFilterSchema = z.object({
  name: z.string(),
  extensions: z.array(z.string())
})

/**
 * `dialog:openFile` / `dialog:openFiles` / `dialog:saveFile`. Both fields are
 * optional -- every dialog has a working default -- so this rejects a malformed
 * filter list rather than a missing one. Electron throws from inside
 * showOpenDialog on a bad filter shape, which surfaces as a dialog that never
 * opens and an error naming none of our own code.
 */
export const fileDialogArgsSchema = z.object({
  filters: z.array(fileFilterSchema).optional(),
  defaultPath: z.string().optional()
})

/**
 * Raw bytes: `fs:writeBytes` and `bik:convert`. Buffer extends Uint8Array, so
 * this accepts both. Anything else reaches `Buffer.from` or `hash.update` and
 * throws a TypeError from deep inside Node with no channel name attached.
 */
export const bytesSchema = z.instanceof(Uint8Array)

/**
 * `fs:writeFile` content. The loosest schema here and still worth having: this
 * is the one channel where a wrong type does not throw at all. `fs.writeFile`
 * coerces its data argument, so an object lands on disk as "[object Object]"
 * and the write reports success -- a silent bad write over a real file.
 */
export const textContentSchema = z.string()

/** `tileScan:analyze` -- the directories to walk. Each is root-checked separately. */
export const dirPathListSchema = z.array(z.string())

/**
 * A map name for `maps:scanWarpReferrers` and `maps:updateWarpTargets`. Not a
 * path -- it is matched against, and written into, the `<warp>` targets of every
 * active map XML, so it belongs with `fs:writeFile` rather than with the
 * path-safety checks: a non-string `newName` would be coerced into the document
 * and persisted across dozens of files at once. Empty is rejected too, which a
 * bare `z.string()` would allow: rewriting every warp to point at "" edits the
 * same files just as destructively.
 */
export const mapNameSchema = z.string().min(1).max(200)

/** `pack:import` options. Absent means "do not force". */
export const packImportOptionsSchema = z.object({ force: z.boolean().optional() }).optional()

/**
 * `music:deploy-pack` encode parameters, which become ffmpeg's `-b:a <n>k` and
 * `-ar <n>`. The bounds are deliberately wider than the two values the Settings
 * UI offers (64/128/192 kbps, 22050/44100 Hz): these arrive from a persisted
 * settings.json that a user may have hand-edited, and the job here is to reject
 * a value that cannot be an encode parameter, not to re-litigate the menu.
 */
export const encodeParamsSchema = z.object({
  kbps: z.number().int().min(8).max(320),
  sampleRate: z.number().int().min(8000).max(192_000)
})
