export type MapFlag = 'Snow' | 'Rain' | 'Dark' | 'NoMap' | 'Winter'
export type CardinalDirection = 'North' | 'South' | 'East' | 'West'
export type BoardType = 'Signpost' | 'MessageBoard'

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

export const ALL_SPAWN_FLAGS: MapSpawnFlag[] = ['Active', 'MovementDisabled', 'AiDisabled', 'DeathDisabled']

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
  reactors: [],
}

export const ALL_FLAGS: MapFlag[] = ['Snow', 'Rain', 'Dark', 'NoMap', 'Winter']
export const ALL_DIRECTIONS: CardinalDirection[] = ['North', 'South', 'East', 'West']
export const ALL_BOARD_TYPES: string[] = ['Signpost', 'Messageboard']

/** Derive the canonical XML filename from map Id. */
export function computeMapFilename(id: number): string {
  const padded = String(id).padStart(5, '0')
  return id >= 30000 ? `hyb${padded}.xml` : `lod${padded}.xml`
}
