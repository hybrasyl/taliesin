// Grayscale master cache for the duotone pipeline.
//
// A "master" is the BT.601 grayscale of a source PNG, written once to
// `{packDir}/_masters/{basename}.png` and reused across single-icon and batch
// renders. The duotone algorithm only consumes luminance, so working from a
// pre-grayscaled cache produces byte-equivalent output to working from the
// color source while letting batch jobs skip the conversion step on rerun.
//
// Cache validity is mtime-based: if the source mtime is newer than the
// master, or the master is missing, we regenerate.

import { PixelBuffer, toGrayscale } from './duotone'
import { loadPixelBufferFromPath, pixelBufferToPngBytes } from './imageLoader'
import { basenameFromPath } from './paletteIO'

export interface MasterFreshness {
  masterPath: string
  regenerated: boolean
}

export function masterPathFor(packDir: string, sourcePath: string): string {
  return `${packDir}/_masters/${basenameFromPath(sourcePath)}.png`
}

export function shouldRegenerate(
  master: { mtimeMs: number } | null,
  source: { mtimeMs: number } | null,
  force: boolean
): boolean {
  if (force) return true
  if (master === null) return true
  // Source missing is unusual; let the caller surface the read error rather
  // than silently regenerating from nothing.
  if (source === null) return false
  return source.mtimeMs > master.mtimeMs
}

export interface MasterIODeps {
  stat: (path: string) => Promise<{ mtimeMs: number; sizeBytes: number } | null>
  writeBytes: (path: string, data: Uint8Array) => Promise<void>
  loadPixels: (path: string) => Promise<PixelBuffer>
  encodePng: (buf: PixelBuffer) => Promise<Uint8Array>
}

const defaultDeps = (): MasterIODeps => ({
  stat: (p) => window.api.stat(p),
  writeBytes: (p, d) => window.api.writeBytes(p, d),
  loadPixels: loadPixelBufferFromPath,
  encodePng: pixelBufferToPngBytes
})

export async function ensureMasterFresh(
  packDir: string,
  sourcePath: string,
  opts: { force?: boolean } = {},
  deps: MasterIODeps = defaultDeps()
): Promise<MasterFreshness> {
  const masterPath = masterPathFor(packDir, sourcePath)
  const force = opts.force === true

  let regenerate = force
  if (!regenerate) {
    const [masterStat, sourceStat] = await Promise.all([
      deps.stat(masterPath),
      deps.stat(sourcePath)
    ])
    regenerate = shouldRegenerate(masterStat, sourceStat, false)
  }

  if (regenerate) {
    const sourcePixels = await deps.loadPixels(sourcePath)
    const grayscale = toGrayscale(sourcePixels)
    const png = await deps.encodePng(grayscale)
    await deps.writeBytes(masterPath, png)
  }

  return { masterPath, regenerated: regenerate }
}

export async function loadMasterPixels(
  packDir: string,
  sourcePath: string,
  opts: { force?: boolean } = {},
  deps: MasterIODeps = defaultDeps()
): Promise<PixelBuffer> {
  const { masterPath } = await ensureMasterFresh(packDir, sourcePath, opts, deps)
  return deps.loadPixels(masterPath)
}
