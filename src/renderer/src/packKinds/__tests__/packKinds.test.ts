import { describe, it, expect } from 'vitest'
import { abilityIconsKind } from '../abilityIcons'
import { nationBadgesKind } from '../nationBadges'
import { legendMarkIconsKind } from '../legendMarkIcons'
import { itemIconsKind } from '../itemIcons'
import { uiSpriteOverridesKind } from '../uiSpriteOverrides'
import { musicKind } from '../music'
import { soundEffectsKind } from '../soundEffects'
import { worldMapsKind } from '../worldMaps'
import { getKind, listKinds, isKnownContentType, PACK_KINDS } from '../index'
import type { PackAsset } from '../types'

describe('PACK_KINDS registry', () => {
  it('has all 8 known content types', () => {
    expect(Object.keys(PACK_KINDS).sort()).toEqual([
      'ability_icons',
      'item_icons',
      'legend_mark_icons',
      'music',
      'nation_badges',
      'sound_effects',
      'ui_sprite_overrides',
      'world_maps'
    ])
  })

  it('listKinds returns each kind once', () => {
    expect(listKinds()).toHaveLength(8)
    const types = new Set(listKinds().map((k) => k.type))
    expect(types.size).toBe(8)
  })

  it('getKind returns the matching kind', () => {
    expect(getKind('ability_icons')).toBe(abilityIconsKind)
    expect(getKind('item_icons')).toBe(itemIconsKind)
  })

  it('isKnownContentType discriminates valid vs unknown', () => {
    expect(isKnownContentType('ability_icons')).toBe(true)
    expect(isKnownContentType('item_icons')).toBe(true)
    expect(isKnownContentType('tiles')).toBe(false)
    expect(isKnownContentType('')).toBe(false)
  })
})

describe('abilityIconsKind', () => {
  it('parseSlot reads skill and spell namespaces', () => {
    expect(abilityIconsKind.parseSlot('skill0001.png')).toEqual({ namespace: 'skill', id: 1 })
    expect(abilityIconsKind.parseSlot('spell0042.png')).toEqual({ namespace: 'spell', id: 42 })
    expect(abilityIconsKind.parseSlot('nation0001.png')).toBeNull()
  })

  it('nextAssetPath defaults to skill namespace and is 1-based', () => {
    const path = abilityIconsKind.nextAssetPath({ existingAssets: [] })
    expect(path).toEqual({ zipPath: 'skill0001.png', relPath: 'skill0001.png' })
  })

  it('nextAssetPath honors the spell namespace from ctx', () => {
    const path = abilityIconsKind.nextAssetPath({ ctx: { namespace: 'spell' }, existingAssets: [] })
    expect(path.zipPath).toBe('spell0001.png')
  })

  it('nextAssetPath increments per-namespace independently', () => {
    const existing: PackAsset[] = [
      { filename: 'skill0001.png', sourcePath: 'a' },
      { filename: 'skill0002.png', sourcePath: 'b' }
    ]
    expect(
      abilityIconsKind.nextAssetPath({ ctx: { namespace: 'skill' }, existingAssets: existing }).zipPath
    ).toBe('skill0003.png')
    expect(
      abilityIconsKind.nextAssetPath({ ctx: { namespace: 'spell' }, existingAssets: existing }).zipPath
    ).toBe('spell0001.png')
  })

  it('dimension validates 32×32 strict', () => {
    expect(abilityIconsKind.dimension!.validate(32, 32)).toBeNull()
    expect(abilityIconsKind.dimension!.validate(31, 31)).toMatch(/Expected 32×32/)
    expect(abilityIconsKind.dimension!.validate(64, 64)).toMatch(/Expected 32×32/)
  })

  it('coversSchema requires the [32, 32] tuple', () => {
    expect(() =>
      abilityIconsKind.coversSchema.parse({ ability_icons: { dimensions: [32, 32] } })
    ).not.toThrow()
    expect(() =>
      abilityIconsKind.coversSchema.parse({ ability_icons: { dimensions: [16, 16] } })
    ).toThrow()
  })

  it('namespaces returns skill and spell', () => {
    expect(abilityIconsKind.namespaces?.([])).toEqual(['skill', 'spell'])
  })
})

describe('nationBadgesKind', () => {
  it('parseSlot reads nation namespace', () => {
    expect(nationBadgesKind.parseSlot('nation0001.png')).toEqual({ namespace: 'nation', id: 1 })
    expect(nationBadgesKind.parseSlot('skill0001.png')).toBeNull()
  })

  it('nextAssetPath is 1-based', () => {
    expect(nationBadgesKind.nextAssetPath({ existingAssets: [] }).zipPath).toBe('nation0001.png')
  })

  it('dimension accepts anything', () => {
    expect(nationBadgesKind.dimension!.validate(1, 1)).toBeNull()
    expect(nationBadgesKind.dimension!.validate(128, 256)).toBeNull()
  })

  it('coversSchema is strict empty', () => {
    expect(() => nationBadgesKind.coversSchema.parse({ nation_badges: {} })).not.toThrow()
    expect(() =>
      nationBadgesKind.coversSchema.parse({ nation_badges: { extra: 'nope' } })
    ).toThrow()
  })
})

describe('legendMarkIconsKind', () => {
  it('parseSlot reads legend namespace', () => {
    expect(legendMarkIconsKind.parseSlot('legend0000.png')).toEqual({ namespace: 'legend', id: 0 })
    expect(legendMarkIconsKind.parseSlot('legend0042.png')).toEqual({ namespace: 'legend', id: 42 })
  })

  it('nextAssetPath is 0-based — first slot is legend0000.png', () => {
    expect(legendMarkIconsKind.nextAssetPath({ existingAssets: [] }).zipPath).toBe('legend0000.png')
  })

  it('nextAssetPath increments past the highest existing id', () => {
    const existing: PackAsset[] = [
      { filename: 'legend0000.png', sourcePath: 'a' },
      { filename: 'legend0003.png', sourcePath: 'b' }
    ]
    expect(legendMarkIconsKind.nextAssetPath({ existingAssets: existing }).zipPath).toBe(
      'legend0004.png'
    )
  })

  it('dimension accepts 20×20 and 21×20, rejects others', () => {
    expect(legendMarkIconsKind.dimension!.validate(20, 20)).toBeNull()
    expect(legendMarkIconsKind.dimension!.validate(21, 20)).toBeNull()
    expect(legendMarkIconsKind.dimension!.validate(22, 20)).toMatch(/width/)
    expect(legendMarkIconsKind.dimension!.validate(20, 21)).toMatch(/height/)
  })
})

describe('itemIconsKind', () => {
  it('parseSlot reads item namespace with 5-digit id', () => {
    expect(itemIconsKind.parseSlot('item00001.png')).toEqual({ namespace: 'item', id: 1 })
    expect(itemIconsKind.parseSlot('item12345.png')).toEqual({ namespace: 'item', id: 12345 })
    expect(itemIconsKind.parseSlot('item0001.png')).toBeNull() // 4 digits, wrong kind
  })

  it('nextAssetPath is 1-based with 5-digit padding', () => {
    expect(itemIconsKind.nextAssetPath({ existingAssets: [] }).zipPath).toBe('item00001.png')
  })

  it('dimension accepts 16–32 in both axes', () => {
    expect(itemIconsKind.dimension!.validate(16, 16)).toBeNull()
    expect(itemIconsKind.dimension!.validate(32, 32)).toBeNull()
    expect(itemIconsKind.dimension!.validate(24, 30)).toBeNull()
    expect(itemIconsKind.dimension!.validate(15, 16)).toMatch(/width/)
    expect(itemIconsKind.dimension!.validate(33, 16)).toMatch(/width/)
    expect(itemIconsKind.dimension!.validate(16, 33)).toMatch(/height/)
  })

  it('coversSchema accepts optional no_dye array', () => {
    expect(() => itemIconsKind.coversSchema.parse({ item_icons: {} })).not.toThrow()
    expect(() => itemIconsKind.coversSchema.parse({ item_icons: { no_dye: [1, 5, 9] } })).not.toThrow()
    expect(() => itemIconsKind.coversSchema.parse({ item_icons: { no_dye: [-1] } })).toThrow()
  })

  it('exposes a noDye boolean assetMetaField', () => {
    const fields = itemIconsKind.assetMetaFields?.()
    expect(fields?.noDye?.kind).toBe('boolean')
    expect(fields?.noDye?.label).toBe('No dye')
  })
})

describe('uiSpriteOverridesKind', () => {
  it('parseSlot reads <source-file>/<frame>.png', () => {
    expect(uiSpriteOverridesKind.parseSlot('mile.spf/0001.png')).toEqual({
      namespace: 'mile.spf',
      id: 1
    })
    expect(uiSpriteOverridesKind.parseSlot('mile.spf\\0002.png')).toEqual({
      namespace: 'mile.spf',
      id: 2
    })
    expect(uiSpriteOverridesKind.parseSlot('mile.spf/0000.png')).toEqual({
      namespace: 'mile.spf',
      id: 0
    })
    expect(uiSpriteOverridesKind.parseSlot('mile.spf.png')).toBeNull()
    expect(uiSpriteOverridesKind.parseSlot('skill0001.png')).toBeNull()
  })

  it('nextAssetPath requires ctx.namespace', () => {
    expect(() => uiSpriteOverridesKind.nextAssetPath({ existingAssets: [] })).toThrow()
  })

  it('nextAssetPath produces nested 0-based paths and increments per namespace', () => {
    expect(
      uiSpriteOverridesKind.nextAssetPath({ ctx: { namespace: 'mile.spf' }, existingAssets: [] }).zipPath
    ).toBe('mile.spf/0000.png')

    const existing: PackAsset[] = [
      { filename: 'mile.spf/0000.png', sourcePath: 'a' },
      { filename: 'mile.spf/0001.png', sourcePath: 'b' },
      { filename: 'nation.spf/0000.png', sourcePath: 'c' }
    ]
    expect(
      uiSpriteOverridesKind.nextAssetPath({ ctx: { namespace: 'mile.spf' }, existingAssets: existing })
        .zipPath
    ).toBe('mile.spf/0002.png')
    expect(
      uiSpriteOverridesKind.nextAssetPath({
        ctx: { namespace: 'nation.spf' },
        existingAssets: existing
      }).zipPath
    ).toBe('nation.spf/0001.png')
  })

  it('namespaces returns the unique source-file tokens already present', () => {
    const existing: PackAsset[] = [
      { filename: 'mile.spf/0000.png', sourcePath: 'a' },
      { filename: 'mile.spf/0001.png', sourcePath: 'b' },
      { filename: 'nation.spf/0000.png', sourcePath: 'c' }
    ]
    expect(uiSpriteOverridesKind.namespaces?.(existing)).toEqual(['mile.spf', 'nation.spf'])
  })

  it('coversSchema is strict empty', () => {
    expect(() =>
      uiSpriteOverridesKind.coversSchema.parse({ ui_sprite_overrides: {} })
    ).not.toThrow()
    expect(() =>
      uiSpriteOverridesKind.coversSchema.parse({ ui_sprite_overrides: { extra: 'nope' } })
    ).toThrow()
  })

  it('dimension accepts anything', () => {
    expect(uiSpriteOverridesKind.dimension!.validate(1, 1)).toBeNull()
    expect(uiSpriteOverridesKind.dimension!.validate(64, 64)).toBeNull()
  })
})

describe('musicKind', () => {
  it('has no dimension rule and offers audio extensions', () => {
    expect(musicKind.dimension).toBeUndefined()
    expect(musicKind.fileExtensions).toEqual(['ogg', 'mp3', 'wav', 'flac', 'mus'])
  })

  it('parseSlot reads music_{id} entries, zero-pad tolerant, rejects non-matches', () => {
    expect(musicKind.parseSlot('music_0001.ogg')).toEqual({ namespace: 'music', id: 1 })
    expect(musicKind.parseSlot('music_5.mp3')).toEqual({ namespace: 'music', id: 5 })
    expect(musicKind.parseSlot('music_0200.flac')).toEqual({ namespace: 'music', id: 200 })
    expect(musicKind.parseSlot('music0001.ogg')).toBeNull() // missing underscore
    expect(musicKind.parseSlot('music_.ogg')).toBeNull() // empty id
    expect(musicKind.parseSlot('sfx_0001.wav')).toBeNull()
    expect(musicKind.parseSlot('music_0001.png')).toBeNull() // not an audio extension
  })

  it('nextAssetPath increments id and preserves a valid source extension', () => {
    const existing: PackAsset[] = [
      { filename: 'music_0001.ogg', sourcePath: 'a' },
      { filename: 'music_0007.mp3', sourcePath: 'b' }
    ]
    expect(musicKind.nextAssetPath({ existingAssets: existing, sourceExtension: 'mp3' }).zipPath).toBe(
      'music_0008.mp3'
    )
    // unknown/absent source extension falls back to the recommended ogg
    expect(musicKind.nextAssetPath({ existingAssets: [], sourceExtension: 'aiff' }).zipPath).toBe(
      'music_0001.ogg'
    )
    expect(musicKind.nextAssetPath({ existingAssets: [] }).zipPath).toBe('music_0001.ogg')
  })
})

describe('soundEffectsKind', () => {
  it('has no dimension rule and offers audio extensions', () => {
    expect(soundEffectsKind.dimension).toBeUndefined()
    expect(soundEffectsKind.fileExtensions).toEqual(['wav', 'ogg', 'mp3', 'flac'])
  })

  it('parseSlot reads sfx_{id} entries, rejects non-matches', () => {
    expect(soundEffectsKind.parseSlot('sfx_0001.wav')).toEqual({ namespace: 'sfx', id: 1 })
    expect(soundEffectsKind.parseSlot('sfx_500.ogg')).toEqual({ namespace: 'sfx', id: 500 })
    expect(soundEffectsKind.parseSlot('sfx0001.wav')).toBeNull() // missing underscore
    expect(soundEffectsKind.parseSlot('music_0001.ogg')).toBeNull()
    expect(soundEffectsKind.parseSlot('sfx_0001.mus')).toBeNull() // .mus is music-only
  })

  it('nextAssetPath increments id and defaults to wav', () => {
    const existing: PackAsset[] = [{ filename: 'sfx_0003.wav', sourcePath: 'a' }]
    expect(soundEffectsKind.nextAssetPath({ existingAssets: existing, sourceExtension: 'ogg' }).zipPath).toBe(
      'sfx_0004.ogg'
    )
    expect(soundEffectsKind.nextAssetPath({ existingAssets: [] }).zipPath).toBe('sfx_0001.wav')
  })
})

describe('worldMapsKind', () => {
  it('accepts any dimension and uses a custom field-name prompt', () => {
    expect(worldMapsKind.dimension!.validate(2000, 1500)).toBeNull()
    expect(worldMapsKind.customNamespacePrompt).toBeDefined()
    expect(worldMapsKind.namespaces).toBeUndefined()
  })

  it('parseSlot reads {fieldName}.png as a named identity', () => {
    expect(worldMapsKind.parseSlot('field001.png')).toEqual({ namespace: 'field001', id: 0 })
    expect(worldMapsKind.parseSlot('Mileth.png')).toEqual({ namespace: 'Mileth', id: 0 })
    expect(worldMapsKind.parseSlot('sub/field001.png')).toBeNull() // must be at root
    expect(worldMapsKind.parseSlot('field001.epf')).toBeNull()
  })

  it('nextAssetPath names the file after the field namespace', () => {
    expect(worldMapsKind.nextAssetPath({ ctx: { namespace: 'field001' }, existingAssets: [] }).zipPath).toBe(
      'field001.png'
    )
    expect(() => worldMapsKind.nextAssetPath({ ctx: {}, existingAssets: [] })).toThrow(/requires ctx.namespace/)
  })
})
