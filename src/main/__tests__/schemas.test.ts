import { describe, it, expect } from 'vitest'
import {
  taliesinSettingsSchema,
  paletteSchema,
  calibrationFileSchema,
  prefabSchema,
  musicMetaSchema,
  musicMetaDataSchema,
  musicPackArraySchema,
  deployPackSchema,
  packProjectSchema,
  packManifestSchema,
  packCompileFilenamesSchema,
  catalogDataSchema,
  sfxIndexSchema,
  tileThemeSchema
} from '../schemas'

const validSettings = {
  libraries: [],
  activeLibrary: null,
  mapDirectories: [],
  activeMapDirectory: null,
  musicWorkingDirs: [],
  musEncodeKbps: 64,
  musEncodeSampleRate: 22050
}

const validPalette = {
  id: 'elements',
  name: 'Elements',
  version: 1,
  lastModified: '2026-04-25T00:00:00Z',
  entries: [{ id: 'fire', name: 'Fire', shadowColor: '#FF4D2D', highlightColor: '#FF8A3D' }]
}

const validPrefab = {
  name: 'X',
  width: 2,
  height: 2,
  tiles: [
    { background: 1, leftForeground: 0, rightForeground: 0 },
    { background: 1, leftForeground: 0, rightForeground: 0 },
    { background: 1, leftForeground: 0, rightForeground: 0 },
    { background: 1, leftForeground: 0, rightForeground: 0 }
  ],
  createdAt: 't',
  updatedAt: 't'
}

const validMusicPack = {
  id: 'p',
  name: 'P',
  tracks: [{ musicId: 1, sourceFile: 'song.mp3' }],
  createdAt: 't',
  updatedAt: 't'
}

const validPackProject = {
  pack_id: 'x',
  pack_version: '1.0.0',
  content_type: 'ability_icons',
  priority: 0,
  covers: {},
  assets: [],
  createdAt: 't',
  updatedAt: 't'
}

const validTheme = {
  name: 'X',
  createdAt: 't',
  updatedAt: 't',
  primaryGround: 1,
  secondaryGround: 2,
  accentGround: 3,
  pathTile: 4,
  wallTile: 5,
  wallTileRight: 6,
  decorationTile: 7,
  edgeTile: 8
}

describe('taliesinSettingsSchema', () => {
  it('accepts a minimal valid settings object', () => {
    expect(() => taliesinSettingsSchema.parse(validSettings)).not.toThrow()
  })

  it('accepts the full settings shape with optional fields', () => {
    const full = {
      ...validSettings,
      clientPath: '/c',
      activeLibrary: '/lib',
      theme: 'hybrasyl',
      packDir: '/packs',
      companionPath: '/x.exe'
    }
    expect(() => taliesinSettingsSchema.parse(full)).not.toThrow()
  })

  it('rejects a missing required array field', () => {
    expect(() => taliesinSettingsSchema.parse({ ...validSettings, libraries: undefined })).toThrow()
  })

  it('rejects a wrong-type field', () => {
    expect(() => taliesinSettingsSchema.parse({ ...validSettings, musEncodeKbps: '64' })).toThrow()
  })

  it('accepts null for path fields backed by Recoil atoms with null defaults', () => {
    // Atoms like packDirState / companionPathState are typed `string | null`,
    // and App.tsx forwards them straight into the save payload. Schema must
    // tolerate null or settings:save throws on every change until every such
    // field has been set to a string.
    const withNulls = {
      ...validSettings,
      clientPath: null,
      musicLibraryPath: null,
      activeMusicWorkingDir: null,
      ffmpegPath: null,
      packDir: null,
      companionPath: null
    }
    expect(() => taliesinSettingsSchema.parse(withNulls)).not.toThrow()
  })
})

describe('paletteSchema', () => {
  it('accepts a minimal valid palette', () => {
    expect(() => paletteSchema.parse(validPalette)).not.toThrow()
  })

  it('rejects a non-hex color', () => {
    const bad = {
      ...validPalette,
      entries: [{ ...validPalette.entries[0], shadowColor: 'red' }]
    }
    expect(() => paletteSchema.parse(bad)).toThrow(/hex/)
  })

  it('rejects defaultDarkFactor outside [0, 1]', () => {
    const bad = {
      ...validPalette,
      entries: [{ ...validPalette.entries[0], defaultDarkFactor: 2 }]
    }
    expect(() => paletteSchema.parse(bad)).toThrow()
  })
})

describe('calibrationFileSchema', () => {
  it('accepts a record of source calibrations', () => {
    expect(() =>
      calibrationFileSchema.parse({
        'eagle.png': {
          entries: {
            fire: {
              darkFactor: 0.3,
              lightFactor: 0.3,
              midpointLow: 0.25,
              midpointHigh: 0.75,
              lastCalibrated: 't'
            }
          }
        }
      })
    ).not.toThrow()
  })

  it('rejects a missing lastCalibrated', () => {
    expect(() =>
      calibrationFileSchema.parse({
        'eagle.png': {
          entries: {
            fire: { darkFactor: 0.3, lightFactor: 0.3, midpointLow: 0.25, midpointHigh: 0.75 }
          }
        }
      })
    ).toThrow()
  })
})

describe('prefabSchema', () => {
  it('accepts a valid prefab where tiles.length matches w*h', () => {
    expect(() => prefabSchema.parse(validPrefab)).not.toThrow()
  })

  it('rejects a prefab where tiles.length disagrees with w*h', () => {
    expect(() => prefabSchema.parse({ ...validPrefab, width: 3, height: 3 })).toThrow(
      /tiles\.length/
    )
  })

  it('rejects a non-positive dimension', () => {
    expect(() => prefabSchema.parse({ ...validPrefab, width: 0 })).toThrow()
  })

  it('rejects an empty name', () => {
    expect(() => prefabSchema.parse({ ...validPrefab, name: '' })).toThrow()
  })
})

describe('musicMetaSchema and musicMetaDataSchema', () => {
  it('musicMetaSchema accepts an empty object (all fields optional)', () => {
    expect(() => musicMetaSchema.parse({})).not.toThrow()
  })

  it('musicMetaDataSchema rejects a non-record value', () => {
    expect(() => musicMetaDataSchema.parse([])).toThrow()
  })
})

describe('musicPackArraySchema', () => {
  it('accepts an array of valid packs', () => {
    expect(() => musicPackArraySchema.parse([validMusicPack])).not.toThrow()
  })

  it('rejects a pack missing required tracks field', () => {
    const bad = { ...validMusicPack, tracks: undefined }
    expect(() => musicPackArraySchema.parse([bad])).toThrow()
  })
})

describe('deployPackSchema', () => {
  it('accepts a deploy pack with createdAt/updatedAt optional', () => {
    expect(() => deployPackSchema.parse({ id: 'p', name: 'P', tracks: [] })).not.toThrow()
  })

  it('rejects a track with non-integer musicId', () => {
    expect(() =>
      deployPackSchema.parse({
        id: 'p',
        name: 'P',
        tracks: [{ musicId: 'one', sourceFile: 'a' }]
      })
    ).toThrow()
  })
})

describe('packProjectSchema and packManifestSchema', () => {
  it('packProjectSchema accepts a valid project', () => {
    expect(() => packProjectSchema.parse(validPackProject)).not.toThrow()
  })

  it('packProjectSchema rejects an empty pack_id', () => {
    expect(() => packProjectSchema.parse({ ...validPackProject, pack_id: '' })).toThrow()
  })

  it('packManifestSchema accepts a valid manifest', () => {
    expect(() =>
      packManifestSchema.parse({
        schema_version: 1,
        pack_id: 'x',
        pack_version: '1.0.0',
        content_type: 'ability_icons',
        priority: 0,
        covers: {}
      })
    ).not.toThrow()
  })

  it('packManifestSchema rejects a missing schema_version', () => {
    expect(() =>
      packManifestSchema.parse({
        pack_id: 'x',
        pack_version: '1.0.0',
        content_type: 'ability_icons',
        priority: 0,
        covers: {}
      })
    ).toThrow()
  })
})

describe('packCompileFilenamesSchema', () => {
  it('accepts an array of strings', () => {
    expect(() => packCompileFilenamesSchema.parse(['a.png', 'b.png'])).not.toThrow()
  })

  it('rejects a non-string element', () => {
    expect(() => packCompileFilenamesSchema.parse(['a.png', 1])).toThrow()
  })
})

describe('catalogDataSchema', () => {
  it('accepts a record of catalog metas', () => {
    expect(() =>
      catalogDataSchema.parse({ 'lod0001.map': { name: 'Map A', width: 64, height: 64 } })
    ).not.toThrow()
  })

  it('rejects a wrong-type field', () => {
    expect(() => catalogDataSchema.parse({ 'lod0001.map': { name: 123 } })).toThrow()
  })
})

describe('sfxIndexSchema', () => {
  it('accepts a record of annotations', () => {
    expect(() =>
      sfxIndexSchema.parse({ '31.mp3': { name: 'Door', comment: 'Wood door open' } })
    ).not.toThrow()
  })

  it('rejects a wrong-type comment', () => {
    expect(() => sfxIndexSchema.parse({ '31.mp3': { comment: 42 } })).toThrow()
  })
})

describe('tileThemeSchema', () => {
  it('accepts a valid theme', () => {
    expect(() => tileThemeSchema.parse(validTheme)).not.toThrow()
  })

  it('rejects an empty name', () => {
    expect(() => tileThemeSchema.parse({ ...validTheme, name: '' })).toThrow()
  })

  it('rejects a non-integer tile id', () => {
    expect(() => tileThemeSchema.parse({ ...validTheme, primaryGround: 1.5 })).toThrow()
  })
})
