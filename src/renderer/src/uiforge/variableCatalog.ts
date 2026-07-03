import type { UiPanelLayout } from './types'

/**
 * Canonical variable namespace for ui_panels bindings — the single machine-readable
 * source of truth referenced by docs/ui-panel-layout-format.md. Brigid implements
 * the same paths on the consumption side.
 *
 * Indexed templates use `[n]` as the placeholder in `path` (e.g.
 * `inventory.slot[n].count`); shipped XML uses a literal 1-based index
 * (`inventory.slot[3].count`).
 */

export type UiVariableType = 'string' | 'int' | 'float' | 'bool' | 'sprite'

/** Types a numeric-only sink (progressbar value/max, image frame selector) accepts. */
export const NUMERIC_TYPES: readonly UiVariableType[] = ['int', 'float']

export interface UiVariableDef {
  /** Canonical dotted path; `[n]` marks the index placeholder of a template. */
  path: string
  type: UiVariableType
  /** Human namespace label used to group entries in the BindingEditor. */
  namespace: string
  /** Source packet opcode (informational, e.g. '0x08'). */
  packet: string
  description: string
  /** Present only for `[n]` templates: inclusive 1-based range + optional holes. */
  index?: { min: number; max: number; holes?: readonly number[] }
  /** Optional preview sample overriding the type default (format-string preview). */
  sample?: string | number | boolean
}

// ── Namespace builders ──────────────────────────────────────────────────────────

const PLAYER: Array<[string, UiVariableType, string, (string | number)?]> = [
  ['player.name', 'string', 'Character name', 'Aisling'],
  ['player.level', 'int', 'Character level', 99],
  ['player.ability', 'int', 'Ability (medenia) level', 50],
  ['player.hp', 'int', 'Current health', 1200],
  ['player.maxhp', 'int', 'Maximum health', 1500],
  ['player.mp', 'int', 'Current mana', 800],
  ['player.maxmp', 'int', 'Maximum mana', 1000],
  ['player.stats.str', 'int', 'Strength'],
  ['player.stats.int', 'int', 'Intelligence'],
  ['player.stats.wis', 'int', 'Wisdom'],
  ['player.stats.con', 'int', 'Constitution'],
  ['player.stats.dex', 'int', 'Dexterity'],
  ['player.levelpoints', 'int', 'Unspent stat points'],
  ['player.weight', 'int', 'Current weight', 42],
  ['player.maxweight', 'int', 'Maximum weight', 120],
  ['player.experience', 'int', 'Total experience', 1234567],
  ['player.abilityexp', 'int', 'Ability (medenia) experience'],
  ['player.gold', 'int', 'Gold on hand', 500000],
  ['player.blinded', 'bool', 'Whether the character is blinded'],
  ['player.mailstatus', 'bool', 'Whether unread mail/parcels are waiting'],
  ['player.element.offense', 'int', 'Offensive element id'],
  ['player.element.defense', 'int', 'Defensive element id'],
  ['player.combat.mr', 'int', 'Magic resistance (0x08 whole)'],
  ['player.combat.ac', 'int', 'Armor class'],
  ['player.combat.dmg', 'int', 'Damage bonus (0x08 whole)'],
  ['player.combat.hit', 'int', 'Hit bonus (0x08 whole)']
]

const PLAYER_EXT: Array<[string, string]> = [
  ['player.ext.mr', 'Magic resistance (extended, float)'],
  ['player.ext.hit', 'Hit chance (extended, float)'],
  ['player.ext.dmg', 'Damage (extended, float)'],
  ['player.ext.crit', 'Critical chance (extended, float)'],
  ['player.ext.magiccrit', 'Magic critical chance (extended, float)'],
  ['player.ext.dodge', 'Dodge (extended, float)'],
  ['player.ext.magicdodge', 'Magic dodge (extended, float)']
]

const PLAYER_PROFILE: Array<[string, string]> = [
  ['player.profile.guild', 'Guild name'],
  ['player.profile.class', 'Class name'],
  ['player.profile.nation', 'Nation name'],
  ['player.profile.grouptext', 'Group / party status text']
]

/** Hybrasyl ItemSlots enum, slots 1..18 (real equipment slots), lowercased. */
export const EQUIPMENT_SLOTS: readonly string[] = [
  'weapon',
  'armor',
  'shield',
  'helmet',
  'earring',
  'necklace',
  'lhand',
  'rhand',
  'larm',
  'rarm',
  'waist',
  'leg',
  'foot',
  'firstacc',
  'trousers',
  'coat',
  'secondacc',
  'thirdacc'
]

function buildCatalog(): UiVariableDef[] {
  const defs: UiVariableDef[] = []

  for (const [path, type, description, sample] of PLAYER) {
    defs.push({ path, type, namespace: 'player', packet: '0x08', description, sample })
  }
  for (const [path, description] of PLAYER_EXT) {
    defs.push({
      path,
      type: 'float',
      namespace: 'player.ext',
      packet: '0xFF',
      description,
      sample: 12.5
    })
  }
  for (const [path, description] of PLAYER_PROFILE) {
    defs.push({ path, type: 'string', namespace: 'player.profile', packet: '0x39', description })
  }

  // Inventory: 1-based slots 1..59.
  const inventoryFields: Array<[string, UiVariableType, string]> = [
    ['name', 'string', 'Item name'],
    ['count', 'int', 'Stack count'],
    ['durability', 'int', 'Current durability'],
    ['sprite', 'sprite', 'Item sprite'],
    ['color', 'int', 'Item color']
  ]
  for (const [field, type, description] of inventoryFields) {
    defs.push({
      path: `inventory.slot[n].${field}`,
      type,
      namespace: 'inventory',
      packet: '0x0F/0x10',
      description,
      index: { min: 1, max: 59 }
    })
  }

  // Equipment: named slots (not indexed).
  const equipmentFields: Array<[string, UiVariableType, string]> = [
    ['name', 'string', 'Equipped item name'],
    ['sprite', 'sprite', 'Equipped item sprite'],
    ['durability', 'int', 'Equipped item durability']
  ]
  for (const slot of EQUIPMENT_SLOTS) {
    for (const [field, type, description] of equipmentFields) {
      defs.push({
        path: `equipment.${slot}.${field}`,
        type,
        namespace: 'equipment',
        packet: '0x37/0x38',
        description: `${description} (${slot})`
      })
    }
  }

  // Skills / spells: 1-based slots 1..90 with holes at 35/71/89.
  const bookHoles = [35, 71, 89]
  for (const [book, packet] of [
    ['skills', '0x2C/0x2D'],
    ['spells', '0x17/0x18']
  ] as const) {
    for (const [field, type, description] of [
      ['name', 'string', 'Name'],
      ['sprite', 'sprite', 'Icon sprite']
    ] as Array<[string, UiVariableType, string]>) {
      defs.push({
        path: `${book}.slot[n].${field}`,
        type,
        namespace: book,
        packet,
        description: `${book === 'skills' ? 'Skill' : 'Spell'} ${description.toLowerCase()}`,
        index: { min: 1, max: 90, holes: bookHoles }
      })
    }
  }

  defs.push(
    {
      path: 'group.size',
      type: 'int',
      namespace: 'group',
      packet: '0x63',
      description: 'Number of members in the party',
      sample: 3
    },
    {
      path: 'group.ingroup',
      type: 'bool',
      namespace: 'group',
      packet: '0x63',
      description: 'Whether the character is in a party'
    }
  )

  return defs
}

/** The full variable catalog (~90 entries). Frozen — treat as read-only. */
export const VARIABLE_CATALOG: readonly UiVariableDef[] = Object.freeze(buildCatalog())

const CATALOG_BY_PATH = new Map(VARIABLE_CATALOG.map((d) => [d.path, d]))

// ── Path helpers ────────────────────────────────────────────────────────────────

const INDEX_RE = /\[(\d+)\]/

/** Collapse a literal index (`[3]`) to its template placeholder (`[n]`). */
export function normalizeVariablePath(path: string): string {
  return path.replace(/\[\d+\]/g, '[n]')
}

export interface ResolveResult {
  def: UiVariableDef
  /** The 1-based index parsed from a template path, if any. */
  index?: number
  /** True when `index` is outside the template's range or on a hole. */
  indexError?: boolean
}

/**
 * Resolve a (possibly indexed) literal path to its catalog entry.
 * Returns null when the path is not in the catalog at all; a template path used
 * without an index (`inventory.slot.count`) also returns null. An out-of-range or
 * hole index resolves with `indexError: true` (the def is still known).
 */
export function resolveVariable(path: string): ResolveResult | null {
  const template = normalizeVariablePath(path)
  const def = CATALOG_BY_PATH.get(template)
  if (!def) return null
  if (!def.index) {
    // Non-indexed def: reject a stray literal index.
    return INDEX_RE.test(path) ? null : { def }
  }
  // Indexed template: a literal index is required.
  const m = INDEX_RE.exec(path)
  if (!m) return { def, indexError: true }
  const index = parseInt(m[1], 10)
  const { min, max, holes } = def.index
  const bad = index < min || index > max || (holes?.includes(index) ?? false)
  return { def, index, indexError: bad }
}

/** Numeric = int or float (sprite is NOT numeric for arithmetic sinks). */
export function isNumericType(type: UiVariableType): boolean {
  return type === 'int' || type === 'float'
}

export type PathIssue = 'unknown' | 'index-error' | 'type-mismatch' | 'proposed'

/** A path→type map of custom variables declared via design specs (known to the
 *  project but not the built-in catalog). Keys are template-normalized. */
export type CustomVariableMap = ReadonlyMap<string, UiVariableType>

/**
 * Validate a bound path against an optional allowed-type set. Returns null when
 * the path is valid. `unknown` = not in catalog or custom vars; `index-error` =
 * bad/missing index; `type-mismatch` = resolves but to a type outside `allowed`;
 * `proposed` = not in the catalog but declared as a custom (spec'd) variable —
 * known-with-warning, still emitted (renders static until the server exposes it).
 */
export function validatePath(
  path: string,
  allowed?: readonly UiVariableType[],
  custom?: CustomVariableMap
): PathIssue | null {
  const trimmed = path.trim()
  if (!trimmed) return null
  const res = resolveVariable(trimmed)
  if (!res) {
    const customType = custom?.get(normalizeVariablePath(trimmed))
    if (customType) return allowed && !allowed.includes(customType) ? 'type-mismatch' : 'proposed'
    return 'unknown'
  }
  if (res.indexError) return 'index-error'
  if (allowed && !allowed.includes(res.def.type)) return 'type-mismatch'
  return null
}

// ── Covers derivation ─────────────────────────────────────────────────────────

/** Every bound path in a layout (bind/bind-max/bind-visible), template-normalized. */
export function variablesUsedIn(layout: UiPanelLayout): string[] {
  const set = new Set<string>()
  for (const variant of layout.variants) {
    for (const control of variant.controls) {
      const b = control.binding
      if (!b) continue
      for (const raw of [b.path, b.maxPath, b.visiblePath]) {
        if (raw && raw.trim()) set.add(normalizeVariablePath(raw.trim()))
      }
    }
  }
  return [...set].sort()
}

/** Union of variablesUsedIn across every panel layout in a pack. */
export function aggregateVariablesUsed(layouts: readonly UiPanelLayout[]): string[] {
  const set = new Set<string>()
  for (const l of layouts) for (const v of variablesUsedIn(l)) set.add(v)
  return [...set].sort()
}
