/**
 * Offline tile atlas builder.
 *
 * Scans DA .map files from configured directories, builds tile adjacency data
 * and auto-clusters tiles into families. Outputs a static JSON file that ships
 * with the app for use by the procedural map generator.
 *
 * Run: npx tsx scripts/buildTileAtlas.ts
 */

import { promises as fs } from 'fs'
import { join } from 'path'

// ── Config ──────────────────────────────────────────────────────────────────

const MAP_DIRS = [
  'E:\\Hybrasyl Dev\\Maps\\map-collection-prime2\\map-collection-prime',
  'F:\\Documents\\Hybrasyl\\world\\mapfiles'
]

const OUTPUT_PATH = join(__dirname, '..', 'src', 'renderer', 'src', 'data', 'tileAtlas.json')

// Clustering thresholds
const RANGE_GAP_THRESHOLD = 3 // max gap between consecutive IDs in a range cluster
const MIN_FAMILY_SIZE = 3 // families smaller than this become "unclustered"
const MAX_BG_ADJACENCY_NEIGHBORS = 50 // cap neighbors per tile in output to control file size

// ── Types ───────────────────────────────────────────────────────────────────

interface BgFamily {
  id: string
  tiles: number[]
  totalFrequency: number
  topTiles: number[]
}

interface WallFamily {
  id: string
  pairs: [number, number][]
  totalFrequency: number
  commonGrounds: number[]
}

interface TileAtlas {
  scannedAt: string
  fileCount: number
  tileCount: number
  skippedFiles: number
  bgFamilies: BgFamily[]
  wallFamilies: WallFamily[]
  bgAdjacency: Record<string, Record<string, number>>
  bgFrequency: Record<string, number>
}

// ── Dimension resolution ────────────────────────────────────────────────────

function resolveDimensions(fileSize: number): { w: number; h: number } | null {
  const totalTiles = fileSize / 6
  if (!Number.isInteger(totalTiles) || totalTiles <= 0) return null

  let bestW = 0,
    bestH = 0,
    bestDiff = Infinity

  for (let w = 8; w <= Math.min(512, Math.sqrt(totalTiles)); w++) {
    if (totalTiles % w !== 0) continue
    const h = totalTiles / w
    if (h < 8 || h > 512) continue
    const diff = Math.abs(w - h)
    if (diff < bestDiff) {
      bestDiff = diff
      bestW = w
      bestH = h
    }
  }

  if (bestW === 0) return null
  return { w: bestW, h: bestH }
}

// ── Scanning ────────────────────────────────────────────────────────────────

async function scanMaps() {
  // Accumulators
  const bgFreq = new Map<number, number>()
  const bgAdj = new Map<number, Map<number, number>>() // bgId -> neighborBgId -> count

  // Wall pairs: encode as "lfg:rfg" string key
  const wallPairFreq = new Map<string, number>()
  const wallPairGrounds = new Map<string, Map<number, number>>() // pairKey -> bgId -> count

  let fileCount = 0
  let tileCount = 0
  let skippedFiles = 0

  function addBgAdj(a: number, b: number) {
    if (a === 0 || b === 0) return
    let neighbors = bgAdj.get(a)
    if (!neighbors) {
      neighbors = new Map()
      bgAdj.set(a, neighbors)
    }
    neighbors.set(b, (neighbors.get(b) ?? 0) + 1)
  }

  for (const dirPath of MAP_DIRS) {
    let entries: Awaited<ReturnType<typeof fs.readdir>>
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true })
    } catch (e) {
      console.warn(`  Skipping ${dirPath}: ${(e as Error).message}`)
      continue
    }

    const mapFiles = entries.filter((e) => e.isFile() && /\.map$/i.test(e.name))
    console.log(`  ${dirPath}: ${mapFiles.length} .map files`)

    for (const entry of mapFiles) {
      let buf: Buffer
      try {
        buf = await fs.readFile(join(dirPath, entry.name))
      } catch {
        skippedFiles++
        continue
      }

      const dims = resolveDimensions(buf.length)
      if (!dims) {
        skippedFiles++
        continue
      }

      const { w, h } = dims
      const totalTiles = w * h
      fileCount++
      tileCount += totalTiles

      // Read all tiles
      const bg = new Int16Array(totalTiles)
      const lfg = new Int16Array(totalTiles)
      const rfg = new Int16Array(totalTiles)

      for (let i = 0; i < totalTiles; i++) {
        const offset = i * 6
        bg[i] = buf.readInt16LE(offset)
        lfg[i] = buf.readInt16LE(offset + 2)
        rfg[i] = buf.readInt16LE(offset + 4)
      }

      // Process tiles
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x
          const bgId = bg[idx]

          // Background frequency
          if (bgId !== 0) {
            bgFreq.set(bgId, (bgFreq.get(bgId) ?? 0) + 1)
          }

          // Background adjacency (right and down to avoid double-counting)
          if (x + 1 < w) {
            const rightBg = bg[idx + 1]
            addBgAdj(bgId, rightBg)
            addBgAdj(rightBg, bgId)
          }
          if (y + 1 < h) {
            const downBg = bg[(y + 1) * w + x]
            addBgAdj(bgId, downBg)
            addBgAdj(downBg, bgId)
          }

          // Wall pairs
          const l = lfg[idx]
          const r = rfg[idx]
          if (l !== 0 || r !== 0) {
            const pairKey = `${l}:${r}`
            wallPairFreq.set(pairKey, (wallPairFreq.get(pairKey) ?? 0) + 1)

            // Track which bg tile this wall pair sits on
            if (bgId !== 0) {
              let grounds = wallPairGrounds.get(pairKey)
              if (!grounds) {
                grounds = new Map()
                wallPairGrounds.set(pairKey, grounds)
              }
              grounds.set(bgId, (grounds.get(bgId) ?? 0) + 1)
            }
          }
        }
      }

      if (fileCount % 1000 === 0) {
        console.log(`    Processed ${fileCount} files, ${tileCount.toLocaleString()} tiles...`)
      }
    }
  }

  return { bgFreq, bgAdj, wallPairFreq, wallPairGrounds, fileCount, tileCount, skippedFiles }
}

// ── Clustering ──────────────────────────────────────────────────────────────

function clusterBackground(
  bgFreq: Map<number, number>,
  bgAdj: Map<number, Map<number, number>>
): BgFamily[] {
  console.log('\n  Clustering background tiles...')

  // ID-range clustering: DA tilesets are organized sequentially, so tiles with
  // nearby IDs are generally the same visual theme. Find runs of consecutive
  // (or near-consecutive) tile IDs that appear in the data.
  const allTiles = [...bgFreq.keys()].sort((a, b) => a - b)

  // Group tiles into contiguous ID ranges (allowing small gaps)
  const ranges: number[][] = []
  let currentRange: number[] = [allTiles[0]]

  for (let i = 1; i < allTiles.length; i++) {
    const gap = allTiles[i] - allTiles[i - 1]
    if (gap <= RANGE_GAP_THRESHOLD) {
      currentRange.push(allTiles[i])
    } else {
      ranges.push(currentRange)
      currentRange = [allTiles[i]]
    }
  }
  ranges.push(currentRange)

  console.log(`    Found ${ranges.length} raw ID ranges`)

  // Convert ranges to families (filter by min size)
  const families: BgFamily[] = []

  for (const range of ranges) {
    if (range.length < MIN_FAMILY_SIZE) continue

    // Sort by frequency within range
    const sorted = [...range].sort((a, b) => (bgFreq.get(b) ?? 0) - (bgFreq.get(a) ?? 0))

    families.push({
      id: '',
      tiles: range, // keep in ID order
      totalFrequency: range.reduce((sum, t) => sum + (bgFreq.get(t) ?? 0), 0),
      topTiles: sorted.slice(0, 5)
    })
  }

  // Sort families by total frequency descending and assign IDs
  families.sort((a, b) => b.totalFrequency - a.totalFrequency)
  families.forEach((f, i) => {
    f.id = `bg-family-${i}`
  })

  const clusteredCount = families.reduce((sum, f) => sum + f.tiles.length, 0)
  const unclusteredCount = allTiles.length - clusteredCount
  console.log(
    `    Found ${families.length} background families (${clusteredCount} tiles clustered, ${unclusteredCount} singletons/pairs dropped)`
  )
  for (const f of families.slice(0, 20)) {
    const minId = Math.min(...f.tiles)
    const maxId = Math.max(...f.tiles)
    console.log(
      `      ${f.id}: ${f.tiles.length} tiles [${minId}-${maxId}], freq ${f.totalFrequency.toLocaleString()}, top: [${f.topTiles.join(', ')}]`
    )
  }

  return families
}

function clusterWallPairs(
  wallPairFreq: Map<string, number>,
  wallPairGrounds: Map<string, Map<number, number>>
): WallFamily[] {
  console.log('\n  Clustering wall pairs...')

  // Parse pair keys and sort by frequency
  const pairs = [...wallPairFreq.entries()]
    .map(([key, freq]) => {
      const [l, r] = key.split(':').map(Number)
      return { key, lfg: l, rfg: r, freq }
    })
    .sort((a, b) => b.freq - a.freq)

  // Build ground signature vectors for cosine similarity
  // Collect all ground tile IDs used
  const allGroundIds = new Set<number>()
  for (const grounds of wallPairGrounds.values()) {
    for (const bgId of grounds.keys()) allGroundIds.add(bgId)
  }
  const groundIdList = [...allGroundIds].sort((a, b) => a - b)
  const groundIdIndex = new Map(groundIdList.map((id, i) => [id, i]))

  // Build sparse vectors
  function groundVector(pairKey: string): Map<number, number> {
    const grounds = wallPairGrounds.get(pairKey)
    if (!grounds) return new Map()
    // Normalize to unit vector
    let magnitude = 0
    for (const count of grounds.values()) magnitude += count * count
    magnitude = Math.sqrt(magnitude)
    if (magnitude === 0) return new Map()
    const vec = new Map<number, number>()
    for (const [bgId, count] of grounds) {
      const idx = groundIdIndex.get(bgId)
      if (idx !== undefined) vec.set(idx, count / magnitude)
    }
    return vec
  }

  function cosineSim(a: Map<number, number>, b: Map<number, number>): number {
    let dot = 0
    for (const [idx, valA] of a) {
      const valB = b.get(idx)
      if (valB !== undefined) dot += valA * valB
    }
    return dot // vectors are already normalized
  }

  // Greedy clustering: assign each pair to an existing family or create new one
  const families: WallFamily[] = []
  const familyVecs: Map<number, number>[] = [] // representative vector per family
  const SIM_THRESHOLD = 0.7

  for (const pair of pairs) {
    const vec = groundVector(pair.key)
    if (vec.size === 0) continue

    // Find best matching family
    let bestFam = -1
    let bestSim = 0
    for (let i = 0; i < families.length; i++) {
      const sim = cosineSim(vec, familyVecs[i])
      if (sim > bestSim) {
        bestSim = sim
        bestFam = i
      }
    }

    if (bestFam >= 0 && bestSim >= SIM_THRESHOLD) {
      families[bestFam].pairs.push([pair.lfg, pair.rfg])
      families[bestFam].totalFrequency += pair.freq
    } else {
      // New family
      families.push({
        id: `wall-family-${families.length}`,
        pairs: [[pair.lfg, pair.rfg]],
        totalFrequency: pair.freq,
        commonGrounds: []
      })
      familyVecs.push(vec)
    }
  }

  // Compute commonGrounds for each family (top 10 bg tiles across all pairs in family)
  for (const fam of families) {
    const groundCounts = new Map<number, number>()
    for (const [lfg, rfg] of fam.pairs) {
      const key = `${lfg}:${rfg}`
      const grounds = wallPairGrounds.get(key)
      if (grounds) {
        for (const [bgId, count] of grounds) {
          groundCounts.set(bgId, (groundCounts.get(bgId) ?? 0) + count)
        }
      }
    }
    fam.commonGrounds = [...groundCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([bgId]) => bgId)
  }

  // Sort by frequency, re-index
  families.sort((a, b) => b.totalFrequency - a.totalFrequency)
  families.forEach((f, i) => {
    f.id = `wall-family-${i}`
  })

  // Filter out tiny families
  const filtered = families.filter((f) => f.pairs.length >= MIN_FAMILY_SIZE)

  console.log(
    `    Found ${filtered.length} wall families (${families.length - filtered.length} singletons dropped)`
  )
  for (const f of filtered.slice(0, 10)) {
    console.log(
      `      ${f.id}: ${f.pairs.length} pairs, freq ${f.totalFrequency.toLocaleString()}, grounds: [${f.commonGrounds.slice(0, 5).join(', ')}]`
    )
  }

  return filtered
}

// ── Output ──────────────────────────────────────────────────────────────────

function buildOutput(
  bgFreq: Map<number, number>,
  bgAdj: Map<number, Map<number, number>>,
  bgFamilies: BgFamily[],
  wallFamilies: WallFamily[],
  fileCount: number,
  tileCount: number,
  skippedFiles: number
): TileAtlas {
  // Build sparse adjacency output: for each tile, keep top N neighbors by count
  const bgAdjacency: Record<string, Record<string, number>> = {}

  for (const [tileId, neighbors] of bgAdj) {
    const sorted = [...neighbors.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_BG_ADJACENCY_NEIGHBORS)

    const neighborRecord: Record<string, number> = {}
    for (const [nId, count] of sorted) {
      neighborRecord[String(nId)] = count
    }
    bgAdjacency[String(tileId)] = neighborRecord
  }

  // Build frequency output
  const bgFrequency: Record<string, number> = {}
  for (const [tileId, count] of bgFreq) {
    bgFrequency[String(tileId)] = count
  }

  return {
    scannedAt: new Date().toISOString(),
    fileCount,
    tileCount,
    skippedFiles,
    bgFamilies,
    wallFamilies,
    bgAdjacency,
    bgFrequency
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Tile Atlas Builder ===\n')
  console.log('Scanning map directories...')

  const { bgFreq, bgAdj, wallPairFreq, wallPairGrounds, fileCount, tileCount, skippedFiles } =
    await scanMaps()

  console.log(`\nScan complete:`)
  console.log(`  ${fileCount} files processed, ${skippedFiles} skipped`)
  console.log(`  ${tileCount.toLocaleString()} total tiles`)
  console.log(`  ${bgFreq.size} unique background tiles`)
  console.log(`  ${wallPairFreq.size} unique wall pairs`)

  const bgFamilies = clusterBackground(bgFreq, bgAdj)
  const wallFamilies = clusterWallPairs(wallPairFreq, wallPairGrounds)

  console.log('\nBuilding output...')
  const atlas = buildOutput(
    bgFreq,
    bgAdj,
    bgFamilies,
    wallFamilies,
    fileCount,
    tileCount,
    skippedFiles
  )

  // Ensure output directory exists
  const outDir = join(OUTPUT_PATH, '..')
  await fs.mkdir(outDir, { recursive: true })

  const json = JSON.stringify(atlas)
  await fs.writeFile(OUTPUT_PATH, json, 'utf-8')

  const sizeMB = (Buffer.byteLength(json) / 1024 / 1024).toFixed(2)
  console.log(`\nOutput: ${OUTPUT_PATH}`)
  console.log(`  File size: ${sizeMB} MB`)
  console.log(
    `  ${atlas.bgFamilies.length} bg families, ${atlas.wallFamilies.length} wall families`
  )
  console.log(`  ${Object.keys(atlas.bgAdjacency).length} tiles with adjacency data`)
  console.log('\nDone!')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
