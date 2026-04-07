/**
 * World index builder — produces the same index.json format as Creidhne,
 * stored at <libraryRoot>/world/.creidhne/index.json so both apps share it.
 *
 * Creidhne's "libraryPath" = world/xml/; Taliesin's libraryRoot = repo root.
 * All scan logic mirrors Creidhne's index:build IPC handler exactly, plus the
 * new `mapDetails` field (also being added to Creidhne).
 */

import { join } from 'path'
import { promises as fs } from 'fs'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MapDetail {
  id: number
  name: string
  filename: string
  x: number
  y: number
}

export interface CategoryDetail {
  name: string
  count: number
  usedBy: string[]
}

export interface NpcStringKey {
  key: string
  message: string
  category: string
}

export interface WorldIndex {
  libraryPath: string
  builtAt: string
  // Entity name lists (matches Creidhne's INDEX_DIRS order)
  castables: string[]
  creatures: string[]
  creaturebehaviorsets: string[]
  elementtables: string[]
  items: string[]
  localizations: string[]
  lootsets: string[]
  maps: string[]
  nations: string[]
  npcs: string[]
  recipes: string[]
  serverconfigs: string[]
  spawngroups: string[]
  statuses: string[]
  variantgroups: string[]
  worldmaps: string[]
  // Extended map data (Taliesin addition — also being added to Creidhne)
  mapDetails: MapDetail[]
  ignoredMapDetails: MapDetail[]
  // Archived name lists
  archivedCastables: string[]
  archivedCreatures: string[]
  archivedCreaturebehaviorsets: string[]
  archivedElementtables: string[]
  archivedItems: string[]
  archivedLootsets: string[]
  archivedNations: string[]
  archivedNpcs: string[]
  archivedRecipes: string[]
  archivedSpawngroups: string[]
  archivedStatuses: string[]
  archivedVariantgroups: string[]
  // Cross-reference data
  castableClasses: Record<string, string>
  statusCasters: Record<string, string[]>
  npcResponseCalls: Record<string, string>
  npcStringKeys: NpcStringKey[]
  creatureTypes: string[]
  castableTrainers: Record<string, string[]>
  itemVendors: Record<string, string[]>
  itemLootSets: Record<string, string[]>
  elementnames: string[]
  scripts: string[]
  // Category details
  itemCategories: string[]
  castableCategories: string[]
  statusCategories: string[]
  itemCategoryDetails: CategoryDetail[]
  castableCategoryDetails: CategoryDetail[]
  statusCategoryDetails: CategoryDetail[]
  // Miscellaneous
  vendorTabs: string[]
  npcJobs: string[]
  creatureFamilies: string[]
  cookieNames: string[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INDEX_DIRS = [
  'castables', 'creatures', 'creaturebehaviorsets', 'elementtables', 'items',
  'localizations', 'lootsets', 'maps', 'nations', 'npcs', 'recipes',
  'serverconfigs', 'spawngroups', 'statuses', 'variantgroups', 'worldmaps',
] as const

type IndexDir = (typeof INDEX_DIRS)[number]

/** Types whose identifier is an XML attribute on the root element. */
const ATTR_NAME_MAP: Partial<Record<IndexDir, string>> = {
  statuses:             'Name',
  creatures:            'Name',
  creaturebehaviorsets: 'Name',
  elementtables:        'Name',
  lootsets:             'Name',
  serverconfigs:        'Name',
  spawngroups:          'Name',
  localizations:        'Locale',
}

// ── Path helpers ──────────────────────────────────────────────────────────────

/**
 * Creidhne-compatible .creidhne directory.
 * libraryRoot = world/xml/ → .creidhne is one level up at world/.creidhne/
 * Matches Creidhne exactly: join(libraryPath, '..', '.creidhne')
 */
function creidhneDirPath(libraryRoot: string): string {
  return join(libraryRoot, '..', '.creidhne')
}

export function getIndexPath(libraryRoot: string): string {
  return join(libraryRoot, '..', '.creidhne', 'index.json')
}

/**
 * libraryRoot IS the xml dir (world/xml/) — same meaning as Creidhne's libraryPath.
 * Kept as a named alias for clarity.
 */
function xmlDir(libraryRoot: string): string {
  return libraryRoot
}

// ── File utilities ────────────────────────────────────────────────────────────

async function walkDir(
  dir: string,
  ext: string,
  base: string,
  results: string[] = []
): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) await walkDir(full, ext, base, results)
      else if (e.isFile() && e.name.endsWith(ext)) {
        results.push(full.slice(base.length + 1).replace(/\\/g, '/').replace(/\.[^.]+$/, ''))
      }
    }
  } catch { /* dir may not exist */ }
  return results
}

/** Read all names from a type's .ignore (archived) subdirectory. */
async function readIgnored(dirPath: string, nameRegex: RegExp): Promise<string[]> {
  const names: string[] = []
  try {
    const ignoredDir = join(dirPath, '.ignore')
    const entries = await fs.readdir(ignoredDir, { withFileTypes: true })
    for (const file of entries.filter(e => e.isFile() && e.name.endsWith('.xml'))) {
      const content = await fs.readFile(join(ignoredDir, file.name), 'utf-8')
      const m = nameRegex.exec(content)
      if (m) { const n = m[1].trim(); if (n && !names.includes(n)) names.push(n) }
    }
  } catch { /* .ignore may not exist */ }
  return names.sort()
}

// ── Main build ────────────────────────────────────────────────────────────────

export async function buildWorldIndex(libraryRoot: string): Promise<WorldIndex> {
  const libPath = xmlDir(libraryRoot)
  const index: Record<string, unknown> = {
    libraryPath: libPath,
    builtAt: new Date().toISOString(),
  }

  for (const type of INDEX_DIRS) {
    const dirPath = join(libPath, type)
    const names: string[] = []
    const attrName = ATTR_NAME_MAP[type]

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      for (const file of entries.filter(e => e.isFile() && e.name.endsWith('.xml'))) {
        const content = await fs.readFile(join(dirPath, file.name), 'utf-8')

        if (type === 'castables') {
          const nameMatch = /<Name>([^<]+)<\/Name>/.exec(content)
          if (nameMatch) {
            const name = nameMatch[1].trim()
            if (name && !names.includes(name)) {
              names.push(name)
              const classMatch = /<Castable[^>]+Class="([^"]*)"/.exec(content)
              if (classMatch) {
                if (!index.castableClasses) index.castableClasses = {}
                ;(index.castableClasses as Record<string, string>)[name] = classMatch[1].trim()
              }
              const statusesMatch = /<Statuses>([\s\S]*?)<\/Statuses>/.exec(content)
              if (statusesMatch) {
                if (!index.statusCasters) index.statusCasters = {}
                const sc = index.statusCasters as Record<string, string[]>
                const addRegex = /<Add[^>]*>([^<]+)<\/Add>/g
                let am
                while ((am = addRegex.exec(statusesMatch[1])) !== null) {
                  const key = am[1].trim().toLowerCase()
                  if (key) {
                    if (!sc[key]) sc[key] = []
                    if (!sc[key].includes(name)) sc[key].push(name)
                  }
                }
              }
            }
          }

        } else if (type === 'localizations') {
          const localeMatch = /\bLocale="([^"]+)"/.exec(content)
          if (localeMatch) {
            const name = localeMatch[1].trim()
            if (name && !names.includes(name)) names.push(name)
          }
          if (!index.npcResponseCalls) index.npcResponseCalls = {}
          const nrc = index.npcResponseCalls as Record<string, string>
          const npcCallRegex = /<Response[^>]+Call="([^"]+)"[^>]*>([^<]*)<\/Response>/g
          let callMatch
          while ((callMatch = npcCallRegex.exec(content)) !== null) {
            const call = callMatch[1].trim()
            if (call) nrc[call] = callMatch[2].trim()
          }
          if (!index.npcStringKeys) index.npcStringKeys = []
          const nsk = index.npcStringKeys as NpcStringKey[]
          for (const [tag, label] of [['Common', 'Common'], ['Merchant', 'Merchant'], ['MonsterSpeak', 'Monster']] as [string, string][]) {
            const sectionMatch = new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`).exec(content)
            if (!sectionMatch) continue
            const strRegex = /<String[^>]+Key="([^"]+)"[^>]*>([^<]*)<\/String>/g
            let sm
            while ((sm = strRegex.exec(sectionMatch[0])) !== null) {
              const key = sm[1].trim()
              const message = sm[2].trim()
              if (key && !nsk.some(s => s.key === key && s.category === label)) {
                nsk.push({ key, message, category: label })
              }
            }
          }

        } else if (type === 'creatures') {
          const nameMatch = /\bName="([^"]+)"/.exec(content)
          if (nameMatch) {
            const name = nameMatch[1].trim()
            if (name && !names.includes(name)) names.push(name)
          }
          if (!index.creatureTypes) index.creatureTypes = []
          const ct = index.creatureTypes as string[]
          const typeRegex = /<Type[^>]+Name="([^"]+)"/g
          let tm
          while ((tm = typeRegex.exec(content)) !== null) {
            const tn = tm[1].trim()
            if (tn && !ct.includes(tn)) ct.push(tn)
          }

        } else if (type === 'maps') {
          // Extract <Name> for the names list, plus Id/X/Y for mapDetails
          const nameMatch = /<Name>([^<]+)<\/Name>/.exec(content)
          if (nameMatch) {
            const name = nameMatch[1].trim()
            if (name && !names.includes(name)) names.push(name)
            const idMatch = /\bId="(\d+)"/.exec(content)
            const xMatch = /\bX="(\d+)"/.exec(content)
            const yMatch = /\bY="(\d+)"/.exec(content)
            if (idMatch && xMatch && yMatch) {
              if (!index.mapDetails) index.mapDetails = []
              ;(index.mapDetails as MapDetail[]).push({
                id: parseInt(idMatch[1], 10),
                name,
                filename: file.name,
                x: parseInt(xMatch[1], 10),
                y: parseInt(yMatch[1], 10),
              })
            }
          }

        } else if (attrName) {
          const match = new RegExp(`\\b${attrName}="([^"]+)"`).exec(content)
          if (match) {
            const name = match[1].trim()
            if (name && !names.includes(name)) names.push(name)
          }

        } else if (type === 'npcs') {
          const nameMatch = /<Name>([^<]+)<\/Name>/.exec(content)
          if (nameMatch) {
            const npcName = nameMatch[1].trim()
            if (npcName && !names.includes(npcName)) names.push(npcName)
            const trainMatch = /<Train>([\s\S]*?)<\/Train>/.exec(content)
            if (trainMatch) {
              if (!index.castableTrainers) index.castableTrainers = {}
              const trainers = index.castableTrainers as Record<string, string[]>
              const castableRegex = /<Castable[^>]+Name="([^"]+)"/g
              let cm
              while ((cm = castableRegex.exec(trainMatch[1])) !== null) {
                const key = cm[1].trim().toLowerCase()
                if (!trainers[key]) trainers[key] = []
                if (!trainers[key].includes(npcName)) trainers[key].push(npcName)
              }
            }
            const vendMatch = /<Vend>([\s\S]*?)<\/Vend>/.exec(content)
            if (vendMatch) {
              if (!index.itemVendors) index.itemVendors = {}
              const vendors = index.itemVendors as Record<string, string[]>
              const vendItemRegex = /<Item[^>]+Name="([^"]+)"/g
              let vm
              while ((vm = vendItemRegex.exec(vendMatch[1])) !== null) {
                const key = vm[1].trim().toLowerCase()
                if (key) {
                  if (!vendors[key]) vendors[key] = []
                  if (!vendors[key].includes(npcName)) vendors[key].push(npcName)
                }
              }
            }
          }

        } else if (type === 'variantgroups' || type === 'worldmaps') {
          // variantgroups and worldmaps: only the top-level <Name>, not nested ones (e.g. <Point><Name>)
          const nameMatch = /<Name>([^<]+)<\/Name>/.exec(content)
          if (nameMatch) {
            const name = nameMatch[1].trim()
            if (name && !names.includes(name)) names.push(name)
          }

        } else {
          // nations, items, recipes — use all <Name> child elements
          const nameRegex = /<Name>([^<]+)<\/Name>/g
          let match
          while ((match = nameRegex.exec(content)) !== null) {
            const name = match[1].trim()
            if (name && !names.includes(name)) names.push(name)
          }
        }
      }
      names.sort()
    } catch { /* dir may not exist */ }

    index[type] = names

    // Archived (.ignore) names for types that support archiving
    const archivedRegexMap: Partial<Record<IndexDir, RegExp>> = {
      castables:            /<Name>([^<]+)<\/Name>/,
      creatures:            /\bName="([^"]+)"/,
      creaturebehaviorsets: /\bName="([^"]+)"/,
      elementtables:        /\bName="([^"]+)"/,
      items:                /<Name>([^<]+)<\/Name>/,
      lootsets:             /\bName="([^"]+)"/,
      nations:              /<Name>([^<]+)<\/Name>/,
      npcs:                 /<Name>([^<]+)<\/Name>/,
      recipes:              /<Name>([^<]+)<\/Name>/,
      spawngroups:          /\bName="([^"]+)"/,
      statuses:             /\bName="([^"]+)"/,
      variantgroups:        /<Name>([^<]+)<\/Name>/,
    }
    const archivedRegex = archivedRegexMap[type]
    if (archivedRegex) {
      const key = `archived${type.charAt(0).toUpperCase()}${type.slice(1)}`
      index[key] = await readIgnored(dirPath, archivedRegex)
    }
  }

  // ── Element names ─────────────────────────────────────────────────────────
  const elementNamesSet = new Set<string>()
  try {
    const etDir = join(libPath, 'elementtables')
    for (const file of (await fs.readdir(etDir, { withFileTypes: true })).filter(e => e.isFile() && e.name.endsWith('.xml'))) {
      const content = await fs.readFile(join(etDir, file.name), 'utf-8')
      const elemRegex = /<Source[^>]+Element="([^"]+)"/g
      let m
      while ((m = elemRegex.exec(content)) !== null) {
        if (m[1].trim()) elementNamesSet.add(m[1].trim())
      }
    }
  } catch { /* dir may not exist */ }
  index.elementnames = [...elementNamesSet].sort()

  // ── Lua scripts ──────────────────────────────────────────────────────────
  const scriptsDir = join(libPath, '..', 'scripts')
  index.scripts = (await walkDir(scriptsDir, '.lua', scriptsDir)).sort()

  // ── Category details ─────────────────────────────────────────────────────
  const scanCatDetails = async (dir: string): Promise<CategoryDetail[]> => {
    const catMap: Record<string, { count: number; usedBy: string[] }> = {}
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries.filter(e => e.isFile() && e.name.endsWith('.xml'))) {
        const content = await fs.readFile(join(dir, entry.name), 'utf-8')
        const nameMatch = /<Name>([^<]+)<\/Name>/.exec(content) || /\bName="([^"]+)"/.exec(content)
        const itemName = nameMatch ? nameMatch[1].trim() : entry.name.replace(/\.xml$/i, '')
        const catSection = /<Categories[^>]*>([\s\S]*?)<\/Categories>/.exec(content)
        if (!catSection) continue
        const body = catSection[1]
        const catElemRegex = /<Category\b[^>]*>([^<]+)<\/Category>/g
        const catAttrRegex = /<Category\b[^>]*\bName="([^"]+)"/g
        let m
        while ((m = catElemRegex.exec(body)) !== null) {
          const c = m[1].trim()
          if (c) {
            if (!catMap[c]) catMap[c] = { count: 0, usedBy: [] }
            catMap[c].count++
            if (catMap[c].usedBy.length < 5) catMap[c].usedBy.push(itemName)
          }
        }
        while ((m = catAttrRegex.exec(body)) !== null) {
          const c = m[1].trim()
          if (c) {
            if (!catMap[c]) catMap[c] = { count: 0, usedBy: [] }
            catMap[c].count++
            if (catMap[c].usedBy.length < 5) catMap[c].usedBy.push(itemName)
          }
        }
      }
    } catch { /* dir may not exist */ }
    return Object.entries(catMap)
      .map(([name, { count, usedBy }]) => ({ name, count, usedBy: count < 5 ? usedBy : [] }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }
  const itemCatDetails     = await scanCatDetails(join(libPath, 'items'))
  const castableCatDetails = await scanCatDetails(join(libPath, 'castables'))
  const statusCatDetails   = await scanCatDetails(join(libPath, 'statuses'))
  index.itemCategories          = itemCatDetails.map(c => c.name)
  index.castableCategories      = castableCatDetails.map(c => c.name)
  index.statusCategories        = statusCatDetails.map(c => c.name)
  index.itemCategoryDetails     = itemCatDetails
  index.castableCategoryDetails = castableCatDetails
  index.statusCategoryDetails   = statusCatDetails

  // ── Vendor tabs ───────────────────────────────────────────────────────────
  const vendorTabsSet = new Set<string>()
  try {
    const itemsDir = join(libPath, 'items')
    for (const entry of (await fs.readdir(itemsDir, { withFileTypes: true })).filter(e => e.isFile() && e.name.endsWith('.xml'))) {
      const content = await fs.readFile(join(itemsDir, entry.name), 'utf-8')
      const shopTabRegex = /\bShopTab="([^"]+)"/g
      let m
      while ((m = shopTabRegex.exec(content)) !== null) {
        if (m[1].trim()) vendorTabsSet.add(m[1].trim())
      }
    }
  } catch { /* dir may not exist */ }
  index.vendorTabs = [...vendorTabsSet].sort()

  // ── NPC job prefixes ─────────────────────────────────────────────────────
  const npcJobsSet = new Set<string>()
  try {
    const npcsDir = join(libPath, 'npcs')
    for (const entry of (await fs.readdir(npcsDir, { withFileTypes: true })).filter(e => e.isFile() && e.name.endsWith('.xml'))) {
      const namePart = entry.name.replace(/\.xml$/i, '')
      const idx = namePart.indexOf('_')
      if (idx > 0) {
        const prefix = namePart.slice(0, idx)
        if (prefix && prefix.toLowerCase() !== 'npc') npcJobsSet.add(prefix)
      }
    }
  } catch { /* dir may not exist */ }
  index.npcJobs = [...npcJobsSet].sort()

  // ── Creature family prefixes ──────────────────────────────────────────────
  const creatureFamiliesSet = new Set<string>()
  try {
    const creaturesDir = join(libPath, 'creatures')
    for (const entry of (await fs.readdir(creaturesDir, { withFileTypes: true })).filter(e => e.isFile() && e.name.endsWith('.xml'))) {
      const namePart = entry.name.replace(/\.xml$/i, '')
      const idx = namePart.indexOf('_')
      if (idx > 0) {
        const prefix = namePart.slice(0, idx)
        if (prefix) creatureFamiliesSet.add(prefix)
      }
    }
  } catch { /* dir may not exist */ }
  index.creatureFamilies = [...creatureFamiliesSet].sort()

  // ── Cookie names from Lua scripts ─────────────────────────────────────────
  const cookieNamesSet = new Set<string>()
  const cookieRegex = /\w+\.setcookie\s*\(\s*"([^"]+)"/gi
  const scanCookieNames = async (dir: string): Promise<void> => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) await scanCookieNames(full)
        else if (entry.isFile() && entry.name.endsWith('.lua')) {
          const content = await fs.readFile(full, 'utf-8')
          cookieRegex.lastIndex = 0
          let m
          while ((m = cookieRegex.exec(content)) !== null) {
            if (m[1]) cookieNamesSet.add(m[1])
          }
        }
      }
    } catch { /* dir may not exist */ }
  }
  await scanCookieNames(scriptsDir)
  index.cookieNames = [...cookieNamesSet].sort()

  // ── Sort mapDetails by id ─────────────────────────────────────────────────
  if (Array.isArray(index.mapDetails)) {
    ;(index.mapDetails as MapDetail[]).sort((a, b) => a.id - b.id)
  } else {
    index.mapDetails = []
  }

  // ── Ignored map details (maps/.ignore/) ───────────────────────────────────
  const ignoredMapDetails: MapDetail[] = []
  try {
    const ignoredMapsDir = join(libPath, 'maps', '.ignore')
    const ignoredEntries = await fs.readdir(ignoredMapsDir, { withFileTypes: true })
    for (const file of ignoredEntries.filter(e => e.isFile() && e.name.endsWith('.xml'))) {
      const content = await fs.readFile(join(ignoredMapsDir, file.name), 'utf-8')
      const nameMatch = /<Name>([^<]+)<\/Name>/.exec(content)
      const idMatch = /\bId="(\d+)"/.exec(content)
      const xMatch = /\bX="(\d+)"/.exec(content)
      const yMatch = /\bY="(\d+)"/.exec(content)
      if (idMatch && xMatch && yMatch) {
        ignoredMapDetails.push({
          id: parseInt(idMatch[1], 10),
          name: nameMatch ? nameMatch[1].trim() : '',
          filename: file.name,
          x: parseInt(xMatch[1], 10),
          y: parseInt(yMatch[1], 10),
        })
      }
    }
  } catch { /* .ignore may not exist */ }
  ignoredMapDetails.sort((a, b) => a.id - b.id)
  index.ignoredMapDetails = ignoredMapDetails

  // ── Write to disk ─────────────────────────────────────────────────────────
  await fs.mkdir(creidhneDirPath(libraryRoot), { recursive: true })
  await fs.writeFile(getIndexPath(libraryRoot), JSON.stringify(index, null, 2), 'utf-8')

  return index as unknown as WorldIndex
}

// ── Path resolution ───────────────────────────────────────────────────────────

/**
 * Given any folder the user selected, resolve to the canonical world/xml/ path
 * that Creidhne uses as its libraryPath.
 *
 * Checks three common levels the user might have picked:
 *   world/xml/   → return as-is
 *   world/       → return join(selected, 'xml')
 *   repo root    → return join(selected, 'world', 'xml')
 *
 * Uses .creidhne presence and characteristic xml subdirectories as signals.
 * Returns null if the folder doesn't appear to be a valid Hybrasyl library.
 */
export async function resolveLibraryPath(selected: string): Promise<string | null> {
  const probe = async (p: string): Promise<boolean> => {
    try { await fs.access(p); return true } catch { return false }
  }

  const norm = selected.replace(/[\\/]+$/, '')
  const folderName = norm.split(/[\\/]/).pop()?.toLowerCase() ?? ''

  // Level: world/xml/ — .creidhne is one level up, or folder is named 'xml',
  // or characteristic xml content dirs (maps + npcs) are direct children
  if (
    await probe(join(norm, '..', '.creidhne')) ||
    folderName === 'xml' ||
    (await probe(join(norm, 'maps')) && await probe(join(norm, 'npcs')))
  ) {
    return norm
  }

  // Level: world/ — .creidhne is a direct child, or xml/ subdir exists
  if (await probe(join(norm, '.creidhne')) || await probe(join(norm, 'xml'))) {
    return join(norm, 'xml')
  }

  // Level: repo root — world/.creidhne or world/xml/ exists
  if (await probe(join(norm, 'world', '.creidhne')) || await probe(join(norm, 'world', 'xml'))) {
    return join(norm, 'world', 'xml')
  }

  return null
}

// ── Read / status / delete ────────────────────────────────────────────────────

export async function readWorldIndex(libraryRoot: string): Promise<WorldIndex | null> {
  try {
    const raw = await fs.readFile(getIndexPath(libraryRoot), 'utf-8')
    return JSON.parse(raw) as WorldIndex
  } catch {
    return null
  }
}

export async function getIndexStatus(libraryRoot: string): Promise<{ exists: boolean; builtAt?: string }> {
  try {
    const raw = await fs.readFile(getIndexPath(libraryRoot), 'utf-8')
    const { builtAt } = JSON.parse(raw)
    return { exists: true, builtAt: typeof builtAt === 'string' ? builtAt : undefined }
  } catch {
    return { exists: false }
  }
}

export async function deleteWorldIndex(libraryRoot: string): Promise<void> {
  try {
    await fs.unlink(getIndexPath(libraryRoot))
  } catch { /* already gone */ }
}
