import type { ContentType, PackKind } from './types'
import { abilityIconsKind } from './abilityIcons'
import { nationBadgesKind } from './nationBadges'
import { legendMarkIconsKind } from './legendMarkIcons'
import { itemIconsKind } from './itemIcons'
import { uiSpriteOverridesKind } from './uiSpriteOverrides'

// To add a new content type:
//   1. Create src/renderer/src/packKinds/<kind>.ts exporting a PackKind.
//   2. Register it below.
//   3. Add the literal to the content_type enum in src/main/schemas/pack.ts.
// No edits to PackEditor / CreatePackDialog / AssetPackPage / IPC handlers.
export const PACK_KINDS: Record<ContentType, PackKind> = {
  ability_icons: abilityIconsKind,
  nation_badges: nationBadgesKind,
  legend_mark_icons: legendMarkIconsKind,
  ui_sprite_overrides: uiSpriteOverridesKind,
  item_icons: itemIconsKind
}

export function getKind(type: ContentType): PackKind {
  return PACK_KINDS[type]
}

export function listKinds(): PackKind[] {
  return Object.values(PACK_KINDS)
}

export function isKnownContentType(value: string): value is ContentType {
  return Object.prototype.hasOwnProperty.call(PACK_KINDS, value)
}

export type { ContentType, PackKind, PackProject, PackAsset, SlotIdentity, AssetTargetPath, DimensionRule, AssetMetaField, PackKindPanelProps } from './types'
