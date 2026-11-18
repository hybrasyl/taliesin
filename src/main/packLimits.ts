// Resource limits for .datf asset packs (HTOO-693; Creidhne's HTOO-684, ported).
//
// A pack is a zip that the user drops into a folder, imports or opens, so its
// metadata and its content are untrusted input. Without limits, a hostile or
// damaged pack can make main allocate without bound: a huge entry count in the
// central directory, a huge manifest, or an entry that inflates far past the
// size it declares.
//
// Each limit is far above the packs that exist. Measured on 2026-11-17 over the
// 17 packs in the Brigid assets folder and the client folder (Creidhne): the
// largest pack is 5.9 MB, the most entries 799, the largest manifest 327 bytes,
// the largest entry 4.7 MB (a music track), the most uncompressed 5.9 MB, and
// the highest ratio 6.8 (1.1 for an entry above 1 MiB). A search of this machine
// for Taliesin found no larger pack: the largest is stone.datf, 5,863,625 bytes.
// A production music or tile pack can be much larger, so the limits leave room.

import { createReadStream, promises as fs } from 'fs'

const MiB = 1024 * 1024
const GiB = 1024 * MiB

export interface PackLimits {
  /** The .datf file itself. This also bounds the central directory that the zip reader parses. */
  maxPackBytes: number
  /** Entries in the central directory. */
  maxEntries: number
  /** `_manifest.json`, uncompressed. */
  maxManifestBytes: number
  /** One asset, uncompressed. A long WAV or FLAC track is the largest real case. */
  maxEntryBytes: number
  /** All entries together, uncompressed, as the central directory declares. */
  maxTotalBytes: number
  /** Uncompressed / compressed, for an entry above `ratioFloorBytes`. */
  maxRatio: number
  ratioFloorBytes: number
}

export const PACK_LIMITS: Readonly<PackLimits> = Object.freeze({
  maxPackBytes: 2 * GiB,
  maxEntries: 200_000,
  maxManifestBytes: 16 * MiB,
  maxEntryBytes: 256 * MiB,
  maxTotalBytes: 8 * GiB,
  maxRatio: 100,
  ratioFloorBytes: 1 * MiB
})

/** The part of an unzipper entry these checks read. unzipper ships no types. */
export interface PackZipEntry {
  path: string
  type?: string
  uncompressedSize: number
  compressedSize: number
  stream(): NodeJS.ReadableStream & { destroy?(): void }
}

export interface PackZipDirectory {
  files: PackZipEntry[]
}

/** A pack that a limit refuses. The message is one sentence that names the limit. */
export class PackLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PackLimitError'
  }
}

/**
 * Check a pack's file size and central directory against the limits. Returns
 * a reason (one sentence) when the pack is refused, or null.
 */
export function packLimitViolation(
  fileBytes: number,
  files: readonly Pick<PackZipEntry, 'path' | 'uncompressedSize' | 'compressedSize'>[],
  limits: Readonly<PackLimits> = PACK_LIMITS
): string | null {
  if (fileBytes > limits.maxPackBytes) {
    return `the file is ${fileBytes} bytes, above the limit of ${limits.maxPackBytes}`
  }
  if (files.length > limits.maxEntries) {
    return `it has ${files.length} entries, above the limit of ${limits.maxEntries}`
  }
  let total = 0
  for (const f of files) {
    const size = Number(f.uncompressedSize)
    const packed = Number(f.compressedSize)
    if (!Number.isSafeInteger(size) || size < 0 || !Number.isSafeInteger(packed) || packed < 0) {
      return `entry "${f.path}" declares a size that is not valid`
    }
    const max = f.path === '_manifest.json' ? limits.maxManifestBytes : limits.maxEntryBytes
    if (size > max) return `entry "${f.path}" is ${size} bytes, above the limit of ${max}`
    if (size > limits.ratioFloorBytes && (packed === 0 || size / packed > limits.maxRatio)) {
      return `entry "${f.path}" compresses more than ${limits.maxRatio} to 1`
    }
    total += size
    if (total > limits.maxTotalBytes) {
      return `its entries hold more than ${limits.maxTotalBytes} bytes uncompressed`
    }
  }
  return null
}

/**
 * Read one zip entry into a buffer, and stop as soon as it passes `max` bytes.
 * The central directory's size is only a declaration: the inflate is what is
 * counted, so an entry that inflates past its declared size cannot make main
 * allocate past the limit.
 */
export function readEntryBounded(entry: PackZipEntry, max: number): Promise<Buffer> {
  if (Number(entry.uncompressedSize) > max) {
    return Promise.reject(
      new PackLimitError(`entry "${entry.path}" is above the limit of ${max} bytes`)
    )
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let done = false
    const stream = entry.stream()
    const fail = (err: Error): void => {
      if (done) return
      done = true
      stream.destroy?.()
      reject(err)
    }
    stream.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > max) {
        fail(new PackLimitError(`entry "${entry.path}" inflates past the limit of ${max} bytes`))
        return
      }
      chunks.push(chunk)
    })
    stream.on('error', fail)
    stream.on('end', () => {
      if (done) return
      done = true
      resolve(Buffer.concat(chunks, total))
    })
  })
}

interface UnzipperSource {
  size(): Promise<number>
  stream(start: number, length?: number): NodeJS.ReadableStream
}

/**
 * Open a .datf from disk and check it against the limits before any entry is
 * read. Throws a `PackLimitError` for a refused pack, and the read error for a
 * file that cannot be read.
 *
 * The file size comes first, because it bounds the central directory that the
 * zip reader parses. The pack is read from disk on demand, never into one
 * buffer. The source is the one unzipper's `Open.file` builds, but on this
 * module's `fs`, so the import tests' in-memory `fs` serves it too.
 */
export async function openPackBounded(
  filePath: string,
  limits: Readonly<PackLimits> = PACK_LIMITS
): Promise<PackZipDirectory> {
  const fileBytes = (await fs.stat(filePath)).size
  if (fileBytes > limits.maxPackBytes) {
    throw new PackLimitError(
      `the file is ${fileBytes} bytes, above the limit of ${limits.maxPackBytes}`
    )
  }
  const unzipper = (await import('unzipper')).default as unknown as {
    Open: { custom(source: UnzipperSource): Promise<PackZipDirectory> }
  }
  const directory = await unzipper.Open.custom({
    size: () => Promise.resolve(fileBytes),
    // unzipper's Open.file passes `end: start + length`; the same here.
    stream: (start, length) =>
      createReadStream(filePath, { start, end: length ? start + length : undefined })
  })
  const violation = packLimitViolation(fileBytes, directory.files, limits)
  if (violation) throw new PackLimitError(violation)
  return directory
}
