import { describe, it, expect } from 'vitest'
import { abilityIconsKind } from '../abilityIcons'
import { nationBadgesKind } from '../nationBadges'
import { legendMarkIconsKind } from '../legendMarkIcons'
import { itemIconsKind } from '../itemIcons'
import { uiSpriteOverridesKind } from '../uiSpriteOverrides'
import { musicKind } from '../music'
import { soundEffectsKind } from '../soundEffects'
import { ambientSoundsKind } from '../ambientSounds'
import { worldMapsKind } from '../worldMaps'
import { townMapsKind } from '../townMaps'
import { npcPortraitsKind } from '../npcPortraits'
import { staticTilesKind } from '../staticTiles'
import { creatureSpritesKind } from '../creatureSprites'
import { uiPanelsKind } from '../uiPanels'
import { getKind, listKinds, isKnownContentType, PACK_KINDS } from '../index'
import type { PackAsset, PackProject } from '../types'

describe('PACK_KINDS registry', () => {
  it('has all 14 known content types', () => {
    expect(Object.keys(PACK_KINDS).sort()).toEqual([
      'ability_icons',
      'ambient_sounds',
      'creature_sprites',
      'item_icons',
      'legend_mark_icons',
      'music',
      'nation_badges',
      'npc_portraits',
      'sound_effects',
      'static_tiles',
      'town_maps',
      'ui_panels',
      'ui_sprite_overrides',
      'world_maps'
    ])
  })

  it('listKinds returns each kind once', () => {
    expect(listKinds()).toHaveLength(14)
    const types = new Set(listKinds().map((k) => k.type))
    expect(types.size).toBe(14)
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
      abilityIconsKind.nextAssetPath({ ctx: { namespace: 'skill' }, existingAssets: existing })
        .zipPath
    ).toBe('skill0003.png')
    expect(
      abilityIconsKind.nextAssetPath({ ctx: { namespace: 'spell' }, existingAssets: existing })
        .zipPath
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
    expect(() =>
      itemIconsKind.coversSchema.parse({ item_icons: { no_dye: [1, 5, 9] } })
    ).not.toThrow()
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
      uiSpriteOverridesKind.nextAssetPath({ ctx: { namespace: 'mile.spf' }, existingAssets: [] })
        .zipPath
    ).toBe('mile.spf/0000.png')

    const existing: PackAsset[] = [
      { filename: 'mile.spf/0000.png', sourcePath: 'a' },
      { filename: 'mile.spf/0001.png', sourcePath: 'b' },
      { filename: 'nation.spf/0000.png', sourcePath: 'c' }
    ]
    expect(
      uiSpriteOverridesKind.nextAssetPath({
        ctx: { namespace: 'mile.spf' },
        existingAssets: existing
      }).zipPath
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
    expect(
      musicKind.nextAssetPath({ existingAssets: existing, sourceExtension: 'mp3' }).zipPath
    ).toBe('music_0008.mp3')
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
    expect(
      soundEffectsKind.nextAssetPath({ existingAssets: existing, sourceExtension: 'ogg' }).zipPath
    ).toBe('sfx_0004.ogg')
    expect(soundEffectsKind.nextAssetPath({ existingAssets: [] }).zipPath).toBe('sfx_0001.wav')
  })
})

describe('ambientSoundsKind', () => {
  it('has no dimension rule and offers audio extensions', () => {
    expect(ambientSoundsKind.dimension).toBeUndefined()
    expect(ambientSoundsKind.fileExtensions).toEqual(['wav', 'ogg', 'mp3', 'flac'])
  })

  it('parseSlot reads amb_{id} entries, rejects non-matches', () => {
    expect(ambientSoundsKind.parseSlot('amb_0001.wav')).toEqual({ namespace: 'amb', id: 1 })
    expect(ambientSoundsKind.parseSlot('amb_42.ogg')).toEqual({ namespace: 'amb', id: 42 })
    expect(ambientSoundsKind.parseSlot('amb0001.wav')).toBeNull() // missing underscore
    expect(ambientSoundsKind.parseSlot('sfx_0001.wav')).toBeNull() // that is the sfx kind
    expect(ambientSoundsKind.parseSlot('amb_0001.mus')).toBeNull() // .mus is music-only
  })

  it('nextAssetPath increments id, is 1-based, and defaults to wav', () => {
    // 1-based because the server field is an unsignedByte where 0 means
    // "no ambient", so there is no id 0 to author.
    expect(ambientSoundsKind.nextAssetPath({ existingAssets: [] }).zipPath).toBe('amb_0001.wav')
    const existing: PackAsset[] = [{ filename: 'amb_0003.wav', sourcePath: 'a' }]
    expect(
      ambientSoundsKind.nextAssetPath({ existingAssets: existing, sourceExtension: 'ogg' }).zipPath
    ).toBe('amb_0004.ogg')
  })

  it('exposes a loop boolean assetMetaField', () => {
    expect(ambientSoundsKind.assetMetaFields?.().loop).toMatchObject({
      kind: 'boolean',
      label: 'Loop'
    })
  })

  it('reduceCoversFromMeta keys entries by ID, not by filename', () => {
    // This is the contract, not a style choice: the client looks an entry up by
    // the ambient id the server sent and never sees the zip-relative name.
    const draft = {
      content_type: 'ambient_sounds',
      covers: { ambient_sounds: {} },
      assets: [
        { filename: 'amb_0001.wav', sourcePath: 'a' },
        { filename: 'amb_0007.ogg', sourcePath: 'b' }
      ],
      assetMeta: { 'amb_0001.wav': { loop: true } }
    } as unknown as PackProject
    expect(ambientSoundsKind.reduceCoversFromMeta?.(draft)).toEqual({
      ambient_sounds: { '1': { loop: true } }
    })
  })

  it('omits unflagged entries rather than writing loop:false', () => {
    const draft = {
      content_type: 'ambient_sounds',
      covers: { ambient_sounds: {} },
      assets: [{ filename: 'amb_0001.wav', sourcePath: 'a' }],
      assetMeta: {}
    } as unknown as PackProject
    expect(ambientSoundsKind.reduceCoversFromMeta?.(draft)).toEqual({ ambient_sounds: {} })
  })

  it('coversSchema accepts the v1 shape AND the deferred interval shape', () => {
    // Keying by id is what lets interval scheduling arrive without a schema
    // bump. Nothing here writes the interval fields; accepting them means a
    // pack authored by a later Taliesin still opens in this one.
    expect(() =>
      ambientSoundsKind.coversSchema.parse({ ambient_sounds: { '1': { loop: true } } })
    ).not.toThrow()
    expect(() =>
      ambientSoundsKind.coversSchema.parse({
        ambient_sounds: { '1': { mode: 'interval', play: 180, silence: 120 } }
      })
    ).not.toThrow()
    expect(() => ambientSoundsKind.coversSchema.parse({ ambient_sounds: {} })).not.toThrow()
    expect(() =>
      ambientSoundsKind.coversSchema.parse({ ambient_sounds: { '1': { loop: 'yes' } } })
    ).toThrow()
  })

  it('compiles at manifest schema_version 1 — covers-carried metadata needs no bump', () => {
    expect(ambientSoundsKind.manifestSchemaVersion).toBeUndefined()
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
    expect(
      worldMapsKind.nextAssetPath({ ctx: { namespace: 'field001' }, existingAssets: [] }).zipPath
    ).toBe('field001.png')
    expect(() => worldMapsKind.nextAssetPath({ ctx: {}, existingAssets: [] })).toThrow(
      /requires ctx.namespace/
    )
  })
})

describe('townMapsKind', () => {
  it('parseSlot reads town_{mapId:D5}.png with the map id as slot id', () => {
    expect(townMapsKind.parseSlot('town_00500.png')).toEqual({ namespace: 'town', id: 500 })
    expect(townMapsKind.parseSlot('town_00001.png')).toEqual({ namespace: 'town', id: 1 })
    expect(townMapsKind.parseSlot('town_500.png')).toBeNull() // 3 digits
    expect(townMapsKind.parseSlot('field001.png')).toBeNull()
  })

  it('nextAssetPath pads the prompted map id to 5 digits', () => {
    expect(
      townMapsKind.nextAssetPath({ ctx: { namespace: '500' }, existingAssets: [] }).zipPath
    ).toBe('town_00500.png')
    expect(
      townMapsKind.nextAssetPath({ ctx: { namespace: '1' }, existingAssets: [] }).zipPath
    ).toBe('town_00001.png')
  })

  it('nextAssetPath rejects non-numeric and out-of-range map ids', () => {
    expect(() =>
      townMapsKind.nextAssetPath({ ctx: { namespace: 'abc' }, existingAssets: [] })
    ).toThrow(/numeric map ID/)
    expect(() => townMapsKind.nextAssetPath({ ctx: {}, existingAssets: [] })).toThrow(
      /numeric map ID/
    )
    expect(() =>
      townMapsKind.nextAssetPath({ ctx: { namespace: '0' }, existingAssets: [] })
    ).toThrow(/between 1 and 99999/)
  })

  it('dimension accepts 568×406 and integer multiples, rejects others', () => {
    expect(townMapsKind.dimension!.validate(568, 406)).toBeNull()
    expect(townMapsKind.dimension!.validate(1136, 812)).toBeNull()
    expect(townMapsKind.dimension!.validate(569, 406)).not.toBeNull()
    expect(townMapsKind.dimension!.validate(1136, 406)).not.toBeNull() // mismatched factor
    expect(townMapsKind.customNamespacePrompt).toBeDefined()
  })

  it('covers is a strict empty town_maps object', () => {
    expect(() => townMapsKind.coversSchema.parse({ town_maps: {} })).not.toThrow()
    expect(() => townMapsKind.coversSchema.parse({ town_maps: { x: 1 } })).toThrow()
  })
})

describe('staticTilesKind', () => {
  it('parseSlot reads floor and wall namespaces with 5-digit ids', () => {
    expect(staticTilesKind.parseSlot('floor00001.png')).toEqual({ namespace: 'floor', id: 1 })
    expect(staticTilesKind.parseSlot('wall00342.png')).toEqual({ namespace: 'wall', id: 342 })
    expect(staticTilesKind.parseSlot('floor001.png')).toBeNull() // 3 digits
    expect(staticTilesKind.parseSlot('skill0001.png')).toBeNull()
  })

  it('nextAssetPath defaults to floor, 1-based with 5-digit padding', () => {
    expect(staticTilesKind.nextAssetPath({ existingAssets: [] }).zipPath).toBe('floor00001.png')
  })

  it('nextAssetPath honors the wall namespace and increments per namespace', () => {
    const existing: PackAsset[] = [
      { filename: 'floor00001.png', sourcePath: 'a' },
      { filename: 'floor00002.png', sourcePath: 'b' }
    ]
    expect(
      staticTilesKind.nextAssetPath({ ctx: { namespace: 'floor' }, existingAssets: existing })
        .zipPath
    ).toBe('floor00003.png')
    expect(
      staticTilesKind.nextAssetPath({ ctx: { namespace: 'wall' }, existingAssets: existing })
        .zipPath
    ).toBe('wall00001.png')
  })

  it('namespaces returns floor and wall', () => {
    expect(staticTilesKind.namespaces?.([])).toEqual(['floor', 'wall'])
  })

  it('dimension accepts anything and covers is strict empty', () => {
    expect(staticTilesKind.dimension!.validate(28, 28)).toBeNull()
    expect(() => staticTilesKind.coversSchema.parse({ static_tiles: {} })).not.toThrow()
    expect(() => staticTilesKind.coversSchema.parse({ static_tiles: { x: 1 } })).toThrow()
  })
})

describe('creatureSpritesKind', () => {
  it('parseSlot reads the nested n/e master path with the creature id as slot id', () => {
    expect(
      creatureSpritesKind.parseSlot('creature_sprites/creature_00123/stand/n_001.png')
    ).toEqual({
      namespace: 'n',
      id: 123
    })
    expect(
      creatureSpritesKind.parseSlot('creature_sprites/creature_00001/stand/e_001.png')
    ).toEqual({
      namespace: 'e',
      id: 1
    })
    // backslash separators tolerated
    expect(
      creatureSpritesKind.parseSlot('creature_sprites\\creature_00007\\stand\\n_001.png')
    ).toEqual({
      namespace: 'n',
      id: 7
    })
    expect(
      creatureSpritesKind.parseSlot('creature_sprites/creature_00123/walk/n_001.png')
    ).toBeNull()
    expect(
      creatureSpritesKind.parseSlot('creature_sprites/creature_00123/stand/s_001.png')
    ).toBeNull()
    expect(creatureSpritesKind.parseSlot('skill0001.png')).toBeNull()
  })

  it('nextAssetPath builds the nested path, defaults to n, 1-based per namespace', () => {
    expect(creatureSpritesKind.nextAssetPath({ existingAssets: [] }).zipPath).toBe(
      'creature_sprites/creature_00001/stand/n_001.png'
    )
    const existing: PackAsset[] = [
      { filename: 'creature_sprites/creature_00001/stand/n_001.png', sourcePath: 'a' },
      { filename: 'creature_sprites/creature_00004/stand/n_001.png', sourcePath: 'b' }
    ]
    expect(
      creatureSpritesKind.nextAssetPath({ ctx: { namespace: 'n' }, existingAssets: existing })
        .zipPath
    ).toBe('creature_sprites/creature_00005/stand/n_001.png')
    expect(
      creatureSpritesKind.nextAssetPath({ ctx: { namespace: 'e' }, existingAssets: existing })
        .zipPath
    ).toBe('creature_sprites/creature_00001/stand/e_001.png')
  })

  it('namespaces returns n and e and covers is strict empty', () => {
    expect(creatureSpritesKind.namespaces?.([])).toEqual(['n', 'e'])
    expect(() => creatureSpritesKind.coversSchema.parse({ creature_sprites: {} })).not.toThrow()
    expect(() => creatureSpritesKind.coversSchema.parse({ creature_sprites: { x: 1 } })).toThrow()
  })
})

describe('npcPortraitsKind', () => {
  it('parseSlot reads the portrait key as the identity, rejecting nesting', () => {
    expect(npcPortraitsKind.parseSlot('Gobalt.png')).toEqual({ namespace: 'Gobalt', id: 0 })
    expect(npcPortraitsKind.parseSlot('inn.spf.png')).toEqual({ namespace: 'inn.spf', id: 0 })
    expect(npcPortraitsKind.parseSlot('sub/Gobalt.png')).toBeNull()
    expect(npcPortraitsKind.parseSlot('Gobalt.epf')).toBeNull()
  })

  it('nextAssetPath names the file after the portrait key, requires ctx.namespace', () => {
    expect(
      npcPortraitsKind.nextAssetPath({ ctx: { namespace: 'Gobalt' }, existingAssets: [] }).zipPath
    ).toBe('Gobalt.png')
    expect(() => npcPortraitsKind.nextAssetPath({ ctx: {}, existingAssets: [] })).toThrow(
      /requires ctx.namespace/
    )
  })

  it('dimension enforces square', () => {
    expect(npcPortraitsKind.dimension!.validate(200, 200)).toBeNull()
    expect(npcPortraitsKind.dimension!.validate(200, 256)).toMatch(/square/)
  })

  it('coversSchema requires a square dimensions tuple and string portraits map', () => {
    expect(() =>
      npcPortraitsKind.coversSchema.parse({ npc_portraits: { dimensions: [200, 200] } })
    ).not.toThrow()
    expect(() =>
      npcPortraitsKind.coversSchema.parse({
        npc_portraits: { dimensions: [200, 200], portraits: { Gobalt: 'Gobalt.png' } }
      })
    ).not.toThrow()
    expect(() =>
      npcPortraitsKind.coversSchema.parse({ npc_portraits: { dimensions: [200, 256] } })
    ).toThrow() // non-square
  })

  it('reduceCoversFromMeta rebuilds the portraits map and preserves the square size', () => {
    const draft = {
      content_type: 'npc_portraits',
      covers: { npc_portraits: { dimensions: [200, 200], portraits: {} } },
      assets: [
        { filename: 'Gobalt.png', sourcePath: 'a' },
        { filename: 'inn.spf.png', sourcePath: 'b' }
      ]
    } as unknown as PackProject
    const reduced = npcPortraitsKind.reduceCoversFromMeta?.(draft)
    expect(reduced).toEqual({
      npc_portraits: {
        dimensions: [200, 200],
        portraits: { Gobalt: 'Gobalt.png', 'inn.spf': 'inn.spf.png' }
      }
    })
  })
})

describe('uiPanelsKind', () => {
  it('compiles with manifest schema_version 2', () => {
    expect(uiPanelsKind.manifestSchemaVersion).toBe(2)
  })

  it('parseSlot classifies layouts, backgrounds, control art, and ignores specs', () => {
    expect(uiPanelsKind.parseSlot('extstats.xml')).toEqual({ namespace: 'layout', id: 0 })
    expect(uiPanelsKind.parseSlot('extstats_bg.png')).toEqual({ namespace: 'background', id: 0 })
    expect(uiPanelsKind.parseSlot('extstats_expanded_bg.png')).toEqual({
      namespace: 'background',
      id: 0
    })
    expect(uiPanelsKind.parseSlot('extstats_expand_btn_normal.png')).toEqual({
      namespace: 'art',
      id: 0
    })
    expect(uiPanelsKind.parseSlot('specs/player-comboscore.md')).toBeNull()
    expect(uiPanelsKind.parseSlot('README.txt')).toBeNull()
  })

  it('reduceCoversFromMeta derives panel_ids from xml assets, preserving variables_used', () => {
    const draft = {
      covers: { ui_panels: { panel_ids: ['stale'], variables_used: ['player.hp'] } },
      assets: [
        { filename: 'inventory.xml', sourcePath: 'a' },
        { filename: 'extstats.xml', sourcePath: 'b' },
        { filename: 'extstats_bg.png', sourcePath: 'c' }
      ]
    } as unknown as PackProject
    expect(uiPanelsKind.reduceCoversFromMeta?.(draft)).toEqual({
      ui_panels: { panel_ids: ['extstats', 'inventory'], variables_used: ['player.hp'] }
    })
  })

  it('nextAssetPath uses the prompted filename stem', () => {
    expect(
      uiPanelsKind.nextAssetPath({ ctx: { namespace: 'extstats_bg' }, existingAssets: [] })
    ).toEqual({ zipPath: 'extstats_bg.png', relPath: 'extstats_bg.png' })
    expect(() => uiPanelsKind.nextAssetPath({ existingAssets: [] })).toThrow()
  })
})
