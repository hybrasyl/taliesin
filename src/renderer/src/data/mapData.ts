import type { CapturedComment } from '../utils/xmlComments'

export type MapFlag = 'Snow' | 'Rain' | 'Dark' | 'NoMap' | 'Winter'
export type CardinalDirection = 'North' | 'South' | 'East' | 'West'
// Casing matches the authoritative Hybrasyl XSD enumeration (Common.xsd) and the
// server (IsMessageboard) — 'Messageboard', not 'MessageBoard'.
// 'Sign', not 'Signpost': the enum has exactly these two members, per
// xml/src/Objects/BoardType.cs and the BoardType simple type in Map.xsd.
// 'Signpost' does not deserialize, so a sign carrying it fails the whole map.
export type BoardType = 'Sign' | 'Messageboard'

export interface WarpRestrictions {
  level?: number
  ability?: number
  ab?: number
}

export interface MapWarp {
  x: number
  y: number
  description?: string
  targetType: 'map' | 'worldmap'
  mapTargetName?: string
  mapTargetX?: number
  mapTargetY?: number
  worldMapTarget?: string
  restrictions?: WarpRestrictions
}

export interface MapNpc {
  name: string
  x: number
  y: number
  direction: CardinalDirection
  displayName?: string
}

export interface MapSignEffect {
  onEntry: number
  onEntrySpeed?: number
}

export interface MapSign {
  type: string
  x: number
  y: number
  boardKey?: string
  name?: string
  description?: string
  message?: string
  script?: string
  effect?: MapSignEffect
}

export interface MapReactor {
  x: number
  y: number
  displayName?: string
  description?: string
  script?: string
}

export type MapSpawnFlag = 'Active' | 'MovementDisabled' | 'AiDisabled' | 'DeathDisabled'

export interface MapSpawn {
  import: string
  flags: MapSpawnFlag[]
}

export interface MapSpawnGroup {
  name: string
  baseLevel: number
  spawns: MapSpawn[]
}

export const ALL_SPAWN_FLAGS: MapSpawnFlag[] = [
  'Active',
  'MovementDisabled',
  'AiDisabled',
  'DeathDisabled'
]

export interface MapData {
  id: number
  name: string
  music?: number
  x: number
  y: number
  isEnabled: boolean
  allowCasting: boolean
  dynamicLighting: boolean
  description?: string
  flags: MapFlag[]
  warps: MapWarp[]
  npcs: MapNpc[]
  signs: MapSign[]
  reactors: MapReactor[]
  spawnGroup?: MapSpawnGroup
  /**
   * What the map *is* — its location and building type, as a builder would look
   * for it: "Tagor Tavern". Distinct from `name`, which is the display name the
   * client shows the player ("The Crow & Cask"). The two are unrelated strings
   * and only one of them used to be stored (HTOO-344).
   *
   * Authoring metadata: it is carried in an XML comment and the server never
   * reads it. Its one job is to build a findable filename.
   */
  genericName?: string
  /**
   * Comments found in the file that the model does not otherwise represent,
   * with the addresses they were read from.
   *
   * Carried on the model only so the serializer can put them back — the
   * serializer emits only what it is told to, so anything not carried here is
   * deleted on the first save. See utils/xmlComments.ts.
   */
  comments?: CapturedComment[]
}

export const DEFAULT_MAP: MapData = {
  id: 0,
  name: '',
  x: 40,
  y: 40,
  isEnabled: true,
  allowCasting: true,
  dynamicLighting: false,
  description: '',
  flags: [],
  warps: [],
  npcs: [],
  signs: [],
  reactors: []
}

export const ALL_FLAGS: MapFlag[] = ['Snow', 'Rain', 'Dark', 'NoMap', 'Winter']
export const ALL_DIRECTIONS: CardinalDirection[] = ['North', 'South', 'East', 'West']
export const ALL_BOARD_TYPES: BoardType[] = ['Sign', 'Messageboard']

/** lod/hyb filename prefix from map id — the single source of the 30000 rule. */
export function xmlPrefix(id: number): 'lod' | 'hyb' {
  return id >= 30000 ? 'hyb' : 'lod'
}

/**
 * Make `name` safe to put in a filename.
 *
 * Replaces the characters Windows and POSIX reject, collapses runs of
 * whitespace, and trims. `&` is left alone — it is legal in a filename, and the
 * map that motivated all this has one in its *display* name, which is exactly
 * why the two fields are separate.
 */
export function sanitizeForFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Derive the canonical XML filename from map Id, and its generic name if it has
 * one: `hyb30909 - Tagor Tavern.xml`.
 *
 * With no generic name the output is exactly what it always was, so nothing in
 * the 1011 existing maps that do not use this convention starts looking like it
 * needs renaming. `xmlPrefix` — the single source of the 30000 rule — is
 * untouched.
 */
export function computeMapFilename(id: number, genericName?: string): string {
  const base = `${xmlPrefix(id)}${String(id).padStart(5, '0')}`
  const suffix = sanitizeForFilename(genericName ?? '')
  return suffix ? `${base} - ${suffix}.xml` : `${base}.xml`
}
