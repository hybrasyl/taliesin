# DA archive format findings (for dalib / dalib-ts)

Findings collected while building Taliesin's ArchiveBrowser preview pane. Three things to feed upstream:

1. **New format readers** Taliesin wrote that dalib-ts could absorb (PCX, BIK header peek, JPF unwrap).
2. **Bugs / discrepancies** in dalib-ts — one docstring is inverted from reality and `DataArchive` rejects two official-client archives.
3. **Empirical extension inventory** of the official Dark Ages client — useful baseline for prioritising future dalib-ts coverage.

Plus a short tour of the existing dalib-ts APIs we leaned on, with concrete usage examples.

Snapshot date: 2026-04-25. Client used: official Dark Ages standalone install at `E:\Games\Dark Ages`.

---

## 1. New format readers

### 1.1 PCX (8bpp single-plane, paletted)

DA's `.pcx` entries are vanilla PCX files, restricted to the 8bpp single-plane variant. The header is the standard 128-byte PCX layout; the run-length encoding rule is the standard one (top two bits set ⇒ run marker, low six bits = run length, next byte = pixel value); the 256-colour palette is appended at the very end of the file as a `0x0C` marker followed by 768 RGB bytes.

**Distribution**: 54 entries across 3 archives — `seo.dat: 32`, `setoa.dat: 19`, `cious.dat: 3`.

**Drop-in TypeScript implementation** (no Taliesin-specific imports):

```ts
export interface PcxImage {
  width: number
  height: number
  bpp: number
  /** RGBA pixel bytes (width * height * 4). */
  rgba: Uint8ClampedArray
}

/**
 * Decode an 8bpp single-plane PCX image to RGBA. Returns null for unsupported
 * variants (e.g. 24bpp 3-plane, missing trailing palette).
 */
export function decodePcx(buffer: Uint8Array): PcxImage | null {
  if (buffer.length < 128 || buffer[0] !== 0x0A) return null
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const bpp = buffer[3]
  const xMin = view.getUint16(4, true), yMin = view.getUint16(6, true)
  const xMax = view.getUint16(8, true), yMax = view.getUint16(10, true)
  const nPlanes = buffer[65]
  const bytesPerLine = view.getUint16(66, true)
  const width = xMax - xMin + 1
  const height = yMax - yMin + 1
  if (width <= 0 || height <= 0 || width > 8192 || height > 8192) return null
  if (bpp !== 8 || nPlanes !== 1) return null

  // Decode RLE into a single contiguous indexed buffer (height * bytesPerLine).
  const totalScanlineBytes = bytesPerLine * height
  const indexed = new Uint8Array(totalScanlineBytes)
  let src = 128, dst = 0
  while (dst < totalScanlineBytes && src < buffer.length) {
    const byte = buffer[src++]
    if ((byte & 0xC0) === 0xC0) {
      const runLen = byte & 0x3F
      if (src >= buffer.length) break
      const value = buffer[src++]
      for (let i = 0; i < runLen && dst < totalScanlineBytes; i++) indexed[dst++] = value
    } else {
      indexed[dst++] = byte
    }
  }

  // Locate trailing 256-color palette (0x0C marker followed by 768 bytes).
  const palOffset = buffer.length - 769
  if (palOffset < 128 || buffer[palOffset] !== 0x0C) return null
  const palette = buffer.subarray(palOffset + 1, palOffset + 1 + 768)

  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = indexed[y * bytesPerLine + x]
      const pi = idx * 3
      const off = (y * width + x) * 4
      rgba[off]     = palette[pi]
      rgba[off + 1] = palette[pi + 1]
      rgba[off + 2] = palette[pi + 2]
      rgba[off + 3] = 255
    }
  }
  return { width, height, bpp, rgba }
}
```

Tested against all 54 entries via Taliesin's PcxPreview component. Visual output matches Paint Shop Pro's decode of the same files.

---

### 1.2 BIK header peek (no full decode)

Bink Video full decode is patent-encumbered and unsuitable for a JS-side port, but the **header is freely parseable** and useful — it gets you resolution, frame count, frame rate, and audio track count without touching any patented codec. Taliesin uses the parsed header to drive a metadata panel and gates a "Convert & Play" button that hands the file to ffmpeg's reverse-engineered BIK1 decoder.

**Header layout** (44 bytes):

| Offset | Size | Field |
|---|---|---|
| 0 | 3 | Magic `"BIK"` |
| 3 | 1 | Version letter (`b`, `f`, `i`, …) |
| 4 | 4 | File size minus 8 (LE uint32) |
| 8 | 4 | Frame count (LE uint32) |
| 12 | 4 | Max frame size (LE uint32) |
| 16 | 4 | Frame count again (LE uint32) |
| 20 | 4 | Width (LE uint32) |
| 24 | 4 | Height (LE uint32) |
| 28 | 4 | Frame-rate dividend (LE uint32) |
| 32 | 4 | Frame-rate divisor (LE uint32) |
| 36 | 4 | Video flags (LE uint32) |
| 40 | 4 | Audio track count (LE uint32) |

**Distribution**: 4 entries in `Legend.dat` (`CI.bik`, `CIb.bik`, `CIf.bik`, `CIs.bik`). All are BIKi (Bink 1), 640×480, ~6s. ffmpeg decodes them cleanly with `-c:v libx264 -c:a aac -movflags +faststart`. Taliesin's `bik:convert` IPC handler caches the resulting MP4 by SHA-256 of the input bytes so each video is converted at most once per install.

**Drop-in TypeScript implementation**:

```ts
export interface BikInfo {
  /** Version letter from the magic (e.g. 'b', 'f', 'i'). */
  version: string
  width: number
  height: number
  frameCount: number
  /** Frames per second (computed as frameRateDividend / frameRateDivisor). */
  fps: number
  audioTrackCount: number
}

/**
 * Parse the BIK file header for display metadata.
 * Returns null when the buffer is too short or the magic isn't "BIK".
 */
export function parseBikHeader(buffer: Uint8Array): BikInfo | null {
  if (buffer.length < 44) return null
  if (buffer[0] !== 0x42 || buffer[1] !== 0x49 || buffer[2] !== 0x4B) return null  // "BIK"
  const version = String.fromCharCode(buffer[3])
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const frameCount = view.getUint32(8, true)
  const width = view.getUint32(20, true)
  const height = view.getUint32(24, true)
  const frameRateDividend = view.getUint32(28, true)
  const frameRateDivisor = view.getUint32(32, true)
  const audioTrackCount = view.getUint32(40, true)
  const fps = frameRateDivisor > 0 ? frameRateDividend / frameRateDivisor : 0
  return { version, width, height, frameCount, fps, audioTrackCount }
}
```

---

### 1.3 JPF (JPEG with a 4-byte prefix)

A `.jpf` file is literally `"JPF\0"` (4 bytes: `0x4A 0x50 0x46 0x00`) followed by a standard JPEG/JFIF stream. Skip the 4-byte prefix and any vanilla JPEG decoder takes it from there.

**Distribution**: 1 entry, `Legend.dat/logo.jpf`. We confirmed the decode path by stripping the prefix and re-encoding through ffmpeg with no warnings.

**Implementation**: trivial — there's no special API surface needed. A `JpfFile.toJpegBuffer(): Uint8Array` that returns `buffer.subarray(4)` after a magic check is plenty. Taliesin renders by feeding the unwrapped bytes to the browser via `new Blob([bytes], { type: 'image/jpeg' })`.

```ts
export function unwrapJpf(buffer: Uint8Array): Uint8Array | null {
  if (buffer.length < 6) return null
  if (buffer[0] !== 0x4A || buffer[1] !== 0x50 || buffer[2] !== 0x46 || buffer[3] !== 0x00) return null
  return buffer.subarray(4)
}
```

---

## 2. Bugs / discrepancies in dalib-ts

### 2.1 `FntFile` bit-order docstring is inverted

The dalib-ts docstring on `FntFile.getGlyphData` says:

> Returns the raw 1bpp bytes for glyph at `index`.
> Bits within each byte are in LSB-first order (bit 0 = leftmost pixel).

**Reality**: visual output confirms **MSB-first** (bit 7 = leftmost pixel). Rendering Legend.dat's English fonts with the documented LSB-first interpretation produces glyphs that are mirrored on the X axis.

**Repro**: pick any `.fnt` from `Legend.dat`, render with `glyphWidth = 8`. With the documented bit order:

```ts
const bit = (glyph[byteIdx] >> (x & 7)) & 1   // wrong — produces mirrored glyphs
```

With the actual bit order:

```ts
const bit = (glyph[byteIdx] >> (7 - (x & 7))) & 1   // correct — MSB-first
```

**Fix**: either correct the docstring, or invert the bit-extraction code inside `getGlyphData` / any consumer helpers. Taliesin worked around it client-side by inverting the bit index and leaving a pointer comment to this finding.

### 2.2 `DataArchive.fromBuffer` rejects two official-client archives

When running against the standard Dark Ages client install, two `.dat` files fail to open:

```
! Failed to open album.dat: Duplicate entry name: 
! Failed to open WorldMap.dat: Duplicate entry name:  44 27 44 22
```

The official client opens both archives without complaint, so dalib-ts is either:
- **too strict** on entry-name uniqueness (real archives are allowed to have empty / non-unique entry names), or
- **mis-parsing** the entry table and reading garbage as an entry name.

Note the `album.dat` failure has an empty trailing string — looks like a bogus zero-length entry. The `WorldMap.dat` failure has what looks like binary data (`44 27 44 22` = `D'D"`) being interpreted as a name.

Taliesin's [scripts/discoverArchiveExtensions.ts](../scripts/discoverArchiveExtensions.ts) skips and logs these failures; everything else in the client opens fine.

---

## 3. Empirical extension inventory

Generated by running [scripts/discoverArchiveExtensions.ts](../scripts/discoverArchiveExtensions.ts) against the official client install:

```
Client: E:\Games\Dark Ages
Archives scanned: 23
Total entries: 55,555
Distinct extensions: 20

(2 archives failed to open: album.dat, WorldMap.dat — see § 2.2)
```

Extensions descending by count, with archive distribution:

| Ext | Total | dalib-ts coverage | Source archives |
|---|---:|---|---|
| `.epf` | 28,797 | ✅ `EpfView` / `renderEpf` | khan*.dat (×10), setoa, roh, Legend, national, misc |
| `.hpf` | 23,506 | ✅ `HpfFile` / `renderHpf` | ia.dat |
| `.mpf` | 961 | ✅ `MpfView` / `renderMpf` | hades, misc |
| `.pal` | 847 | ✅ `Palette` | ia, khanpal, hades, seo, Legend, setoa, roh |
| `.spf` | 540 | ✅ `SpfView` / `renderSpf*` | setoa, cious, national, npcbase, roh, khan*ad |
| `.tbl` | 332 | ✅ Typed parsers (PaletteTable / ColorTable / TileAnimationTable / EffectTable) | roh, Legend, ia, khanpal, seo, national, cious, npcbase |
| `.mp3` | 165 | ✅ Standard | Legend.dat |
| `.txt` | 158 | ✅ Standard / `ControlFile` for UI .txt | setoa, cious, Legend, national |
| `.efa` | 134 | ✅ `EfaView` / `renderEfa` | roh, seo |
| `.pcx` | 54 | ❌ **proposed** — see § 1.1 | seo, setoa, cious |
| `.hea` | 34 | ✅ `HeaFile` / `renderDarknessOverlay` | seo.dat |
| `.bmp` | 8 | ✅ `TilesetView` / `renderTile` (DA "BMPs" are headerless tilesets, not real BMPs) | cious, seo |
| `.fnt` | 6 | ✅ `FntFile` (caveat: see § 2.1) | Legend.dat |
| `.bik` | 4 | ❌ header-only — see § 1.2 | Legend.dat |
| `.dat` | 2 | (nested archives — surprising; not investigated) | ia, setoa |
| `.lft` | 2 | ❌ unknown format — not investigated | national.dat |
| `.nfo` | 2 | (plain text) | national.dat |
| `.log` | 1 | (plain text) | Legend.dat |
| `.jpf` | 1 | ❌ **proposed** — see § 1.3 | Legend.dat |
| `.bin` | 1 | (generic binary; hex dump is fine) | national.dat |

The "❌ proposed" rows are the new readers from § 1. The "❌ unknown" rows (`.lft`, nested `.dat`) are out of scope for this snapshot; flagging them in case anyone has prior knowledge.

---

## 4. Existing dalib-ts coverage we exercised

Code pointers showing the APIs Taliesin actually uses, in case any maintainer wants to look at concrete consumer patterns:

- **`DataArchive.fromBuffer` + `archive.entries` + `archive.getEntryBuffer`**: the workhorses — used in every preview component and in [scripts/discoverArchiveExtensions.ts](../scripts/discoverArchiveExtensions.ts). Works on all archives **except** the two flagged in § 2.2.
- **`TilesetView.fromEntry` + `renderTile`**: see `TilesetPreview` in [src/renderer/src/components/archive/ArchivePreview.tsx](../src/renderer/src/components/archive/ArchivePreview.tsx). Renders DA's headerless tile-block "BMPs" with a palette picker and 256-tile pagination.
- **`HeaFile.fromBuffer` + `renderDarknessOverlay`**: see `DarknessPreview` (same file). Single-call render to a canvas-friendly RgbaFrame; no caveats.
- **`FntFile.fromBuffer` + `getGlyphData`**: see `FontPreview`. Works once you account for § 2.1; supports the English (8×12) and Korean (16×12) cell sizes documented in dalib-ts.
- **`ColorTable.fromBuffer`**: see `TextPreview` / `ColorTableSwatches`. Used as a heuristic on `.tbl` entries — if the parse succeeds with non-empty `entries`, render colour swatches above the text.
- **Sprite suite (`EpfView`, `SpfView`, `MpfView`, `EfaView`, `HpfFile` + their `render*` functions)**: see `renderEntry` in [src/renderer/src/utils/archiveRenderer.ts](../src/renderer/src/utils/archiveRenderer.ts). Standard usage, no surprises.
- **`Palette.fromBuffer`**: see `PalettePreview` and the `loadPaletteByName` / `loadPalettes` helpers in `archiveRenderer.ts`. Routine.

`.tbl` files are uniformly text-format across all four typed variants Taliesin encountered, so a plain UTF-8 text view is already adequate and we only invoke `ColorTable.fromBuffer` opportunistically to add the swatch overlay.
