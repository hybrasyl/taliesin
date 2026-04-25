import { describe, it, expect } from 'vitest'
import { classifyEntry, decodePcx, parseBikHeader } from '../archiveRenderer'

// classifyEntry only inspects entry.entryName, so a stub is enough.
const stub = (entryName: string) => ({ entryName }) as Parameters<typeof classifyEntry>[0]

describe('classifyEntry', () => {
  const cases: [string, ReturnType<typeof classifyEntry>][] = [
    // Sprites
    ['mob.epf', 'sprite'],
    ['cape.spf', 'sprite'],
    ['walk.mpf', 'sprite'],
    ['blast.efa', 'sprite'],
    ['banner.hpf', 'sprite'],
    // Palette
    ['mpt001.pal', 'palette'],
    // Text
    ['readme.txt', 'text'],
    ['palette.tbl', 'text'],
    ['debug.log', 'text'],
    ['credits.nfo', 'text'],
    // Audio
    ['theme.mp3', 'audio'],
    ['ambient.wav', 'audio'],
    ['ogg.ogg', 'audio'],
    ['1.mus', 'audio'],
    // Tileset (DA's "BMPs" are headerless tile blocks, not real BMPs)
    ['tilea.bmp', 'tileset'],
    // PCX
    ['npc01.pcx', 'pcx'],
    // Darkness layer
    ['mileth.hea', 'darkness'],
    // Font
    ['legend.fnt', 'font'],
    // BIK video
    ['intro.bik', 'bik'],
    // JPF (JPEG with 4-byte JPF\0 prefix)
    ['logo.jpf', 'jpf'],
    // Hex fallback for anything else
    ['data.bin', 'hex'],
    ['unknown.lft', 'hex'],
    ['weird.fak', 'hex']
  ]

  it.each(cases)('classifies "%s" as %s', (name, expected) => {
    expect(classifyEntry(stub(name))).toBe(expected)
  })

  it('case-insensitive on extension', () => {
    expect(classifyEntry(stub('FOO.EPF'))).toBe('sprite')
    expect(classifyEntry(stub('Bar.Bmp'))).toBe('tileset')
  })
})

describe('parseBikHeader', () => {
  function buildHeader(
    opts: {
      version?: string
      frameCount?: number
      width?: number
      height?: number
      fpsDividend?: number
      fpsDivisor?: number
      audioTracks?: number
      magic?: string
    } = {}
  ): Uint8Array {
    const buf = new Uint8Array(64)
    const view = new DataView(buf.buffer)
    const magic = opts.magic ?? `BIK${opts.version ?? 'i'}`
    for (let i = 0; i < 4; i++) buf[i] = magic.charCodeAt(i)
    view.setUint32(8, opts.frameCount ?? 0, true)
    view.setUint32(20, opts.width ?? 0, true)
    view.setUint32(24, opts.height ?? 0, true)
    view.setUint32(28, opts.fpsDividend ?? 0, true)
    view.setUint32(32, opts.fpsDivisor ?? 1, true)
    view.setUint32(40, opts.audioTracks ?? 0, true)
    return buf
  }

  it('parses a typical BIKi header', () => {
    const info = parseBikHeader(
      buildHeader({
        version: 'i',
        frameCount: 181,
        width: 640,
        height: 480,
        fpsDividend: 30000,
        fpsDivisor: 1000,
        audioTracks: 1
      })
    )
    expect(info).not.toBeNull()
    expect(info!.version).toBe('i')
    expect(info!.width).toBe(640)
    expect(info!.height).toBe(480)
    expect(info!.frameCount).toBe(181)
    expect(info!.fps).toBeCloseTo(30, 4)
    expect(info!.audioTrackCount).toBe(1)
  })

  it('returns null for non-BIK magic', () => {
    expect(parseBikHeader(buildHeader({ magic: 'FAKE' }))).toBeNull()
    expect(parseBikHeader(new Uint8Array([0xff, 0xfe, 0xfd, 0xfc, 0, 0, 0, 0]))).toBeNull()
  })

  it('returns null when buffer is shorter than the 44-byte header', () => {
    expect(parseBikHeader(new Uint8Array(20))).toBeNull()
  })

  it('reports fps=0 when divisor is zero', () => {
    const info = parseBikHeader(buildHeader({ frameCount: 60, fpsDividend: 30, fpsDivisor: 0 }))
    expect(info!.fps).toBe(0)
  })
})

describe('decodePcx', () => {
  /**
   * Build a tiny 8bpp paletted PCX: width × height with `pixels[y * width + x]`
   * indices into a sparse palette. Stores raw (un-RLE'd) scanlines, since any
   * byte < 0xC0 is decoded as a literal.
   */
  function buildPcx(
    width: number,
    height: number,
    pixels: number[],
    palette: [number, number, number][]
  ): Uint8Array {
    const bytesPerLine = width
    const dataLen = bytesPerLine * height
    const total = 128 + dataLen + 1 + 768
    const buf = new Uint8Array(total)
    const view = new DataView(buf.buffer)
    buf[0] = 0x0a // manufacturer
    buf[1] = 5 // version
    buf[2] = 1 // encoding=RLE
    buf[3] = 8 // bpp
    view.setUint16(4, 0, true)
    view.setUint16(6, 0, true)
    view.setUint16(8, width - 1, true)
    view.setUint16(10, height - 1, true)
    buf[65] = 1 // nplanes
    view.setUint16(66, bytesPerLine, true)
    // Scanlines (literals only — every value < 0xC0)
    for (let i = 0; i < dataLen; i++) buf[128 + i] = pixels[i]
    // 0x0C marker + 768-byte palette
    buf[128 + dataLen] = 0x0c
    for (let i = 0; i < 256; i++) {
      const [r, g, b] = palette[i] ?? [0, 0, 0]
      buf[128 + dataLen + 1 + i * 3] = r
      buf[128 + dataLen + 1 + i * 3 + 1] = g
      buf[128 + dataLen + 1 + i * 3 + 2] = b
    }
    return buf
  }

  it('decodes a 2×2 image with a known palette', () => {
    const pal: [number, number, number][] = []
    pal[1] = [255, 0, 0]
    pal[2] = [0, 255, 0]
    pal[3] = [0, 0, 255]
    pal[4] = [255, 255, 255]
    const buf = buildPcx(2, 2, [1, 2, 3, 4], pal)

    const out = decodePcx(buf)
    expect(out).not.toBeNull()
    expect(out!.width).toBe(2)
    expect(out!.height).toBe(2)
    expect(out!.bpp).toBe(8)
    expect([out!.rgba[0], out!.rgba[1], out!.rgba[2], out!.rgba[3]]).toEqual([255, 0, 0, 255])
    expect([out!.rgba[4], out!.rgba[5], out!.rgba[6], out!.rgba[7]]).toEqual([0, 255, 0, 255])
    expect([out!.rgba[8], out!.rgba[9], out!.rgba[10], out!.rgba[11]]).toEqual([0, 0, 255, 255])
    expect([out!.rgba[12], out!.rgba[13], out!.rgba[14], out!.rgba[15]]).toEqual([
      255, 255, 255, 255
    ])
  })

  it('decodes RLE-compressed runs (top two bits set ⇒ run-length marker)', () => {
    // 4 pixels: a run of three 0x05 followed by one 0x07.
    // RLE encoding: 0xC3 0x05 0x07 (one byte expands to 3, then literal).
    const palette: [number, number, number][] = []
    palette[5] = [10, 20, 30]
    palette[7] = [40, 50, 60]

    const dataLen = 3 // 1 RLE pair (2 bytes) + 1 literal
    const total = 128 + dataLen + 1 + 768
    const buf = new Uint8Array(total)
    const view = new DataView(buf.buffer)
    buf[0] = 0x0a
    buf[3] = 8
    view.setUint16(4, 0, true)
    view.setUint16(6, 0, true)
    view.setUint16(8, 3, true) // xMax = 3 ⇒ width 4
    view.setUint16(10, 0, true) // yMax = 0 ⇒ height 1
    buf[65] = 1
    view.setUint16(66, 4, true) // bytesPerLine = 4 (matches scanline)

    // Scanline data (placed at offset 128).
    // RLE marker 0xC3 says repeat next byte 3 times → three 0x05 pixels.
    // Then a literal 0x07.
    buf[128] = 0xc3
    buf[129] = 0x05
    buf[130] = 0x07
    // Trailing palette
    buf[128 + dataLen] = 0x0c
    for (let i = 0; i < 256; i++) {
      const [r, g, b] = palette[i] ?? [0, 0, 0]
      buf[128 + dataLen + 1 + i * 3] = r
      buf[128 + dataLen + 1 + i * 3 + 1] = g
      buf[128 + dataLen + 1 + i * 3 + 2] = b
    }

    const out = decodePcx(buf)
    expect(out).not.toBeNull()
    expect(out!.width).toBe(4)
    expect(out!.height).toBe(1)
    // Three pixels of palette[5] = (10, 20, 30)
    for (let p = 0; p < 3; p++) {
      const off = p * 4
      expect([out!.rgba[off], out!.rgba[off + 1], out!.rgba[off + 2]]).toEqual([10, 20, 30])
    }
    // Fourth pixel = palette[7] = (40, 50, 60)
    expect([out!.rgba[12], out!.rgba[13], out!.rgba[14]]).toEqual([40, 50, 60])
  })

  it('returns null for unsupported variants (24bpp / non-PCX magic)', () => {
    const buf = new Uint8Array(900)
    buf[0] = 0x0a
    buf[3] = 24
    buf[65] = 3
    expect(decodePcx(buf)).toBeNull()

    buf[0] = 0x00
    expect(decodePcx(buf)).toBeNull()
  })

  it('returns null when the trailing palette marker is missing', () => {
    // Build a structurally valid 1×1 PCX, then corrupt the 0x0C palette marker.
    const buf = buildPcx(1, 1, [0], [[1, 2, 3]])
    const palOffset = buf.length - 769
    buf[palOffset] = 0xff // not 0x0C
    expect(decodePcx(buf)).toBeNull()
  })
})
