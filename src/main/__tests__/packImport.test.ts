/**
 * pack:import tests use the real archiver + unzipper libraries (no mocks for
 * those — only fs is mocked via an in-test memfs). The renderer's
 * handlerBridge has a richer memfs for full integration tests; this one is a
 * focused subset that doesn't need to cross the main↔renderer tsconfig
 * boundary.
 *
 * Each test seeds memfs with a synthesized .datf buffer built via archiver,
 * then exercises packImport end-to-end and asserts on the extracted on-disk
 * project + asset paths.
 *
 * TIMEOUT. Whichever test runs first here pays the one-time load of archiver
 * and unzipper, which the rest of the file then reuses. Alone that costs about
 * 700 ms for the whole file, but under a full `npm test` — every project's
 * workers competing for the same cores — it has been measured at 5.4 s and
 * 5.9 s, against vitest's 5 s default. The test was not hanging and nothing was
 * wrong with it; the budget was simply too tight for a loaded machine. The
 * timeout is set per file rather than globally, so a genuine hang anywhere else
 * still fails fast.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.setConfig({ testTimeout: 30_000 })

const memfs = vi.hoisted(() => {
  const files = new Map<string, Buffer>()
  const dirs = new Set<string>(['/'])
  const dirOf = (p: string) => {
    const n = p.replace(/\\/g, '/')
    const slash = n.lastIndexOf('/')
    return slash > 0 ? n.slice(0, slash) : '/'
  }
  const ensureDir = (p: string) => dirs.add(p.replace(/[\\/]+$/, '').replace(/\\/g, '/'))
  const enoent = () => Object.assign(new Error('ENOENT'), { code: 'ENOENT' })

  const fsModule = {
    promises: {
      readFile: vi.fn(async (p: string, enc?: string) => {
        const buf = files.get(p.replace(/\\/g, '/'))
        if (!buf) throw enoent()
        return enc === 'utf-8' || enc === 'utf8' ? buf.toString('utf-8') : buf
      }),
      writeFile: vi.fn(async (p: string, content: string | Buffer | Uint8Array) => {
        const norm = p.replace(/\\/g, '/')
        files.set(
          norm,
          typeof content === 'string'
            ? Buffer.from(content, 'utf-8')
            : Buffer.from(content as Uint8Array)
        )
        ensureDir(dirOf(norm))
      }),
      mkdir: vi.fn(async (p: string) => ensureDir(p.replace(/\\/g, '/'))),
      access: vi.fn(async (p: string) => {
        const n = p.replace(/\\/g, '/')
        if (!files.has(n) && !dirs.has(n)) throw enoent()
      })
    }
  }
  ;(fsModule as unknown as { default: unknown }).default = fsModule
  return {
    files,
    fsModule,
    reset: () => {
      files.clear()
      dirs.clear()
      dirs.add('/')
    }
  }
})

vi.mock('fs', () => memfs.fsModule)
vi.mock('@eriscorp/hybindex-ts', () => {
  const m = {
    buildIndex: vi.fn(),
    loadIndex: vi.fn(),
    saveIndex: vi.fn(),
    getIndexStatus: vi.fn(),
    deleteIndex: vi.fn(),
    listSectionFiles: vi.fn()
  }
  return { ...m, default: m }
})

import { packImport } from '../handlers'
import type { HandlerContext } from '../handlers'

const SETTINGS_PATH = '/appdata/taliesin'

const ctx: HandlerContext = {
  settingsPath: SETTINGS_PATH,
  settingsManager: {
    load: async () => ({}),
    save: async () => undefined
  } as unknown as HandlerContext['settingsManager'],
  appGetVersion: () => '0.0.0',
  settingsRoots: new Set<string>(),
  blessedRoots: new Set<string>(['/work', '/out'])
}

async function buildDatfBytes(
  manifest: object | string,
  files: Record<string, Buffer | string>
): Promise<Buffer> {
  const archiver = (await import('archiver')).default
  const archive = archiver('zip')
  const chunks: Buffer[] = []
  return new Promise<Buffer>((resolve, reject) => {
    archive.on('data', (c: Buffer) => chunks.push(c))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)
    archive.append(typeof manifest === 'string' ? manifest : JSON.stringify(manifest, null, 2), {
      name: '_manifest.json'
    })
    for (const [name, content] of Object.entries(files)) {
      archive.append(typeof content === 'string' ? Buffer.from(content) : content, { name })
    }
    void archive.finalize()
  })
}

beforeEach(() => {
  memfs.reset()
})

describe('packImport — basics', () => {
  it('extracts a compiled .datf into a fresh project + asset files', async () => {
    const fs = memfs
    const datfBytes = await buildDatfBytes(
      {
        schema_version: 1,
        pack_id: 'foo',
        pack_version: '1.2.3',
        content_type: 'ability_icons',
        priority: 100,
        covers: { ability_icons: { dimensions: [32, 32] } }
      },
      {
        'skill0001.png': 'IMG1',
        'spell0001.png': 'IMG2'
      }
    )
    fs.files.set('/out/foo.datf', datfBytes)

    const result = await packImport(ctx, '/out/foo.datf', '/work')

    expect(result.projectFilename).toBe('foo.json')
    expect(result.warnings).toEqual([])

    // Project written under /work
    const project = JSON.parse(fs.files.get('/work/foo.json')!.toString('utf-8'))
    expect(project.pack_id).toBe('foo')
    expect(project.content_type).toBe('ability_icons')
    expect(project.pack_version).toBe('1.2.3')
    // assertInside returns platform-native paths; normalize before comparing.
    const norm = (p: string) => p.replace(/\\/g, '/')
    expect(
      project.assets.map((a: { filename: string; sourcePath: string }) => ({
        filename: a.filename,
        sourcePath: norm(a.sourcePath)
      }))
    ).toEqual([
      { filename: 'skill0001.png', sourcePath: '/work/foo/skill0001.png' },
      { filename: 'spell0001.png', sourcePath: '/work/foo/spell0001.png' }
    ])
    expect(project.assetMeta).toBeUndefined()

    // Assets extracted under /work/foo/
    expect(fs.files.get('/work/foo/skill0001.png')?.toString('utf-8')).toBe('IMG1')
    expect(fs.files.get('/work/foo/spell0001.png')?.toString('utf-8')).toBe('IMG2')
  })

  it('preserves nested ui_sprite_overrides paths', async () => {
    const fs = memfs
    const datfBytes = await buildDatfBytes(
      {
        schema_version: 1,
        pack_id: 'uipack',
        pack_version: '1.0.0',
        content_type: 'ui_sprite_overrides',
        priority: 100,
        covers: { ui_sprite_overrides: {} }
      },
      {
        'mile.spf/0000.png': 'M0',
        'mile.spf/0001.png': 'M1',
        'nation.spf/0000.png': 'N0'
      }
    )
    fs.files.set('/out/ui.datf', datfBytes)

    const result = await packImport(ctx, '/out/ui.datf', '/work')

    expect(result.projectFilename).toBe('uipack.json')
    expect(fs.files.get('/work/uipack/mile.spf/0000.png')?.toString('utf-8')).toBe('M0')
    expect(fs.files.get('/work/uipack/mile.spf/0001.png')?.toString('utf-8')).toBe('M1')
    expect(fs.files.get('/work/uipack/nation.spf/0000.png')?.toString('utf-8')).toBe('N0')

    const project = JSON.parse(fs.files.get('/work/uipack.json')!.toString('utf-8'))
    expect(project.assets.map((a: { filename: string }) => a.filename).sort()).toEqual([
      'mile.spf/0000.png',
      'mile.spf/0001.png',
      'nation.spf/0000.png'
    ])
  })

  it('hydrates assetMeta.noDye from item_icons covers.no_dye', async () => {
    const fs = memfs
    const datfBytes = await buildDatfBytes(
      {
        schema_version: 1,
        pack_id: 'items',
        pack_version: '1.0.0',
        content_type: 'item_icons',
        priority: 100,
        covers: { item_icons: { no_dye: [3, 5] } }
      },
      {
        'item00001.png': 'A',
        'item00003.png': 'B',
        'item00005.png': 'C'
      }
    )
    fs.files.set('/out/items.datf', datfBytes)

    await packImport(ctx, '/out/items.datf', '/work')

    const project = JSON.parse(fs.files.get('/work/items.json')!.toString('utf-8'))
    expect(project.assetMeta).toEqual({
      'item00003.png': { noDye: true },
      'item00005.png': { noDye: true }
    })
  })

  it('round-trips a ui_panels schema_version-2 pack (XML + art, covers preserved)', async () => {
    const fs = memfs
    const panelXml =
      '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<panel id="extstats" layout-version="1">\n' +
      '  <anchor rect="0,0,160,100"/>\n' +
      '  <variant name="compact" background="extstats_bg.png">\n' +
      '    <label name="hp_text" rect="10,10,60,14" bind="player.hp" bind-max="player.maxhp"/>\n' +
      '  </variant>\n' +
      '</panel>\n'
    const datfBytes = await buildDatfBytes(
      {
        schema_version: 2,
        pack_id: 'hybui-extstats',
        pack_version: '0.1.0',
        content_type: 'ui_panels',
        priority: 100,
        covers: {
          ui_panels: {
            panel_ids: ['extstats'],
            variables_used: ['player.hp', 'player.maxhp']
          }
        }
      },
      {
        'extstats.xml': panelXml,
        'extstats_bg.png': 'BG'
      }
    )
    fs.files.set('/out/hybui-extstats.datf', datfBytes)

    const result = await packImport(ctx, '/out/hybui-extstats.datf', '/work')

    expect(result.projectFilename).toBe('hybui-extstats.json')
    expect(result.warnings).toEqual([])

    const project = JSON.parse(fs.files.get('/work/hybui-extstats.json')!.toString('utf-8'))
    expect(project.content_type).toBe('ui_panels')
    // schema_version is a manifest-only field; the project schema does not carry it.
    expect(project.covers.ui_panels.panel_ids).toEqual(['extstats'])
    expect(project.covers.ui_panels.variables_used).toEqual(['player.hp', 'player.maxhp'])
    // ui_panels carries no per-asset metadata (specs are never packed).
    expect(project.assetMeta).toBeUndefined()
    expect(project.assets.map((a: { filename: string }) => a.filename).sort()).toEqual([
      'extstats.xml',
      'extstats_bg.png'
    ])

    // Layout XML + background extracted verbatim.
    expect(fs.files.get('/work/hybui-extstats/extstats.xml')?.toString('utf-8')).toBe(panelXml)
    expect(fs.files.get('/work/hybui-extstats/extstats_bg.png')?.toString('utf-8')).toBe('BG')
  })

  it('refuses to overwrite an existing project unless force is true', async () => {
    const fs = memfs
    const datfBytes = await buildDatfBytes(
      {
        schema_version: 1,
        pack_id: 'dupe',
        pack_version: '1.0.0',
        content_type: 'nation_badges',
        priority: 100,
        covers: { nation_badges: {} }
      },
      { 'nation0001.png': 'X' }
    )
    fs.files.set('/out/dupe.datf', datfBytes)
    fs.files.set('/work/dupe.json', Buffer.from('{}'))

    await expect(packImport(ctx, '/out/dupe.datf', '/work')).rejects.toThrow(/already exists/)

    // force: true overwrites
    await expect(
      packImport(ctx, '/out/dupe.datf', '/work', { force: true })
    ).resolves.toMatchObject({ projectFilename: 'dupe.json' })
    const project = JSON.parse(fs.files.get('/work/dupe.json')!.toString('utf-8'))
    expect(project.pack_id).toBe('dupe')
  })
})

describe('packImport — error paths', () => {
  it('rejects a path not ending in .datf', async () => {
    const fs = memfs
    fs.files.set('/out/foo.zip', Buffer.from('whatever'))
    await expect(packImport(ctx, '/out/foo.zip', '/work')).rejects.toThrow(/\.datf/)
  })

  it('rejects a .datf with no _manifest.json', async () => {
    const fs = memfs
    const archiver = (await import('archiver')).default
    const archive = archiver('zip')
    const chunks: Buffer[] = []
    const bytes = await new Promise<Buffer>((resolve, reject) => {
      archive.on('data', (c: Buffer) => chunks.push(c))
      archive.on('end', () => resolve(Buffer.concat(chunks)))
      archive.on('error', reject)
      archive.append('not a manifest', { name: 'random.txt' })
      void archive.finalize()
    })
    fs.files.set('/out/bad.datf', bytes)
    await expect(packImport(ctx, '/out/bad.datf', '/work')).rejects.toThrow(/Missing _manifest/)
  })

  it('rejects a manifest with an unknown content_type', async () => {
    const fs = memfs
    const datfBytes = await buildDatfBytes(
      {
        schema_version: 1,
        pack_id: 'bad',
        pack_version: '1.0.0',
        content_type: 'tiles', // not in the enum
        priority: 100,
        covers: {}
      },
      {}
    )
    fs.files.set('/out/bad.datf', datfBytes)
    await expect(packImport(ctx, '/out/bad.datf', '/work')).rejects.toThrow(
      /Invalid pack:import:manifest payload/
    )
  })

  it('rejects malformed JSON in _manifest.json', async () => {
    const fs = memfs
    const datfBytes = await buildDatfBytes('this is not json', {})
    fs.files.set('/out/bad.datf', datfBytes)
    await expect(packImport(ctx, '/out/bad.datf', '/work')).rejects.toThrow(/not valid JSON/)
  })

  // The Zip-Slip defense is the assertInside call wrapped around every
  // entry name in packImport. archiver itself normalizes "../escape" away
  // before writing, so a real malicious .datf would have to be crafted with
  // raw zip bytes — out of scope for this test surface. The pathSafety unit
  // tests cover assertInside's traversal handling directly.
})
