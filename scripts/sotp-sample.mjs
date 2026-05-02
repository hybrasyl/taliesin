#!/usr/bin/env node
// One-off helper: extract sotp.dat from ia.dat and print the byte values for
// a given list of stc tile IDs. Used to map the high-nibble property table.
//
// Usage:  node scripts/sotp-sample.mjs <ia.dat path> <id1> [id2 ...]

import { DataArchive } from '@eriscorp/dalib-ts'
import { readFileSync } from 'node:fs'

const [, , iaPath, ...rawIds] = process.argv
if (!iaPath || rawIds.length === 0) {
  console.error('usage: sotp-sample.mjs <ia.dat path> <id1> [id2 ...]')
  process.exit(2)
}
const ids = rawIds.map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n) && n >= 0)

const iaBytes = readFileSync(iaPath)
const ia = DataArchive.fromBuffer(new Uint8Array(iaBytes))
const sotpEntry = ia.get('sotp.dat')
if (!sotpEntry) {
  console.error('ia.dat does not contain sotp.dat')
  process.exit(1)
}
const sotp = ia.getEntryBuffer(sotpEntry)

// tile IDs are 1-based ("tile 0 = empty"), so SOTP[id-1] is the byte for tile `id`.
console.log(`sotp.dat: ${sotp.length} bytes (covers tile IDs 1..${sotp.length})`)
console.log()
console.log('tile-id\tsotp-idx\traw\thex\thi-nibble\tlo-nibble\tpassable\tprop-bit')
for (const id of ids) {
  const idx = id - 1
  if (idx < 0 || idx >= sotp.length) {
    console.log(`${id}\t<out of range>`)
    continue
  }
  const b = sotp[idx]
  const hi = (b & 0xf0) >> 4
  const lo = b & 0x0f
  const passable = (b & 0x0f) === 0
  const prop = (b & 0x80) !== 0
  console.log(
    `${id}\t${idx}\t\t${b}\t0x${b.toString(16).padStart(2, '0')}\t0x${hi.toString(16)}\t0x${lo.toString(16)}\t\t${passable}\t\t${prop}`
  )
}

// Distribution of byte values across the whole table
console.log()
console.log('Full SOTP byte distribution:')
const hist = new Map()
for (const b of sotp) hist.set(b, (hist.get(b) ?? 0) + 1)
const sorted = [...hist.entries()].sort((a, b) => b[1] - a[1])
for (const [byte, count] of sorted) {
  const pct = ((count / sotp.length) * 100).toFixed(1)
  const hi = (byte & 0xf0) >> 4
  const lo = byte & 0x0f
  console.log(
    `  0x${byte.toString(16).padStart(2, '0')}  (hi=0x${hi.toString(16)}, lo=0x${lo.toString(16)})  count=${count}  ${pct}%`
  )
}

// Print all tile IDs that have the 0x80 bit set (the typed-property flag).
// Useful for cross-referencing against known chair/table sprite IDs.
console.log()
console.log('Tiles with bit 7 (0x80) set — first 60:')
let bit7Count = 0
const bit7Ids = []
for (let i = 0; i < sotp.length; i++) {
  if (sotp[i] & 0x80) {
    bit7Ids.push({ id: i, byte: sotp[i] })
    bit7Count++
  }
}
console.log(`  total: ${bit7Count} tiles`)
const preview = bit7Ids.slice(0, 60)
for (const { id, byte } of preview) {
  console.log(`  ${id}\t0x${byte.toString(16).padStart(2, '0')}`)
}
if (bit7Ids.length > 60) console.log(`  ... and ${bit7Ids.length - 60} more`)

// Look for runs of consecutive tile IDs with the 0x80 bit — those tend to
// correspond to a single interactable type (e.g. all chair frames).
console.log()
console.log('Bit-7 runs (consecutive tile-ID groups, ≥3 in a row):')
let runStart = null
for (let i = 0; i < bit7Ids.length; i++) {
  const cur = bit7Ids[i].id
  const next = bit7Ids[i + 1]?.id
  if (runStart === null) runStart = cur
  if (next !== cur + 1) {
    if (cur - runStart >= 2) console.log(`  ${runStart}..${cur}  (${cur - runStart + 1} tiles)`)
    runStart = null
  }
}
