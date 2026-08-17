import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * HTOO-162. Every registered IPC channel must have a recorded answer to one
 * question: what validates the payload the renderer sends it?
 *
 * A one-time sweep of eighty-odd handlers does not stay swept. The card itself
 * is the evidence — it was filed saying "about 6 of roughly 85", and by the time
 * anyone came back to it the real number had moved without anyone noticing in
 * either direction. So the deliverable is not only the missing schemas; it is
 * this test, which fails when a NEW handler is added without a decision.
 *
 * How it works: the channel list is read out of handlers.ts, because that is the
 * only place that can be authoritative about what is registered. Each channel
 * must then be either
 *
 *   - validated: a `parseOrLog(ctx, '<channel>'` call exists for it, or
 *   - listed in EXEMPT below with a category and a reason.
 *
 * Adding a handler and running the suite gives you an error naming the channel
 * you did not classify. Deleting one gives you an error naming the stale exempt
 * entry. Neither can be satisfied by editing a number.
 */

const HANDLERS_SRC = readFileSync(join(import.meta.dirname, '..', 'handlers.ts'), 'utf8')

/** Every `ipcMain.handle('channel'` in registerHandlers. */
const registeredChannels = [...HANDLERS_SRC.matchAll(/ipcMain\.handle\(\s*'([^']+)'/g)].map(
  (m) => m[1]
)

/**
 * Every `parseOrLog(ctx, 'channel'` call site. Sub-channel names are allowed and
 * used where one handler validates two independent payloads
 * (`pack:import:options` vs `pack:import:manifest`) — a name of the form
 * `<channel>:<part>` counts as covering `<channel>`, which is why the match
 * below is a prefix test rather than equality.
 *
 * The channel argument must be a LITERAL for this to see it. That is a real
 * constraint on handlers.ts, and it is noted there beside the dialog handlers,
 * which were the one place tempted to pass it as a variable.
 */
const validatedChannels = new Set(
  [...HANDLERS_SRC.matchAll(/parseOrLog\(\s*ctx,\s*'([^']+)'/g)].map((m) => m[1])
)

function isValidated(channel: string): boolean {
  for (const parsed of validatedChannels) {
    if (parsed === channel || parsed.startsWith(`${channel}:`)) return true
  }
  return false
}

/**
 * Why a channel needs no schema. Three categories, and the distinction is not
 * cosmetic — it is the argument for why the exposure is closed:
 *
 * - `no-payload` — the handler takes no renderer argument at all. There is
 *   nothing to validate.
 * - `path-only` — every argument is a path or a path component, and
 *   `pathSafety.ts` owns those. A non-string reaches `normalize()` and throws
 *   there, so the boundary still fails closed; it just fails with Node's message
 *   instead of ours.
 * - `registry-key` — the argument is a lookup key into an in-memory structure
 *   (a pack coverage map, an archive's entry table). A wrong key finds nothing
 *   and returns null. Nothing is written, so there is no bad state to reach.
 *
 * A channel that WRITES anything derived from its payload does not belong here,
 * whatever the payload's type. That is the rule that moved `maps:updateWarpTargets`
 * out of `path-only` and into the validated set: its "name" arguments are not
 * paths, and they are written into every matching map XML.
 */
const EXEMPT: Record<string, { category: string; reason: string }> = {
  // ── no payload ────────────────────────────────────────────────────────────
  'settings:load': { category: 'no-payload', reason: 'reads settings.json' },
  'get-user-data-path': { category: 'no-payload', reason: 'returns a constant' },
  'app:getVersion': { category: 'no-payload', reason: 'returns app.getVersion()' },
  'app:changelog': { category: 'no-payload', reason: 'reads the bundled CHANGELOG.md' },
  'app:revealSettings': { category: 'no-payload', reason: 'shows settings.json in the OS shell' },
  'app:launchCompanion': {
    category: 'no-payload',
    reason: 'main resolves the companion; the renderer names no path (HTOO-292)'
  },
  'app:companionStatus': { category: 'no-payload', reason: 'reports the resolved companion' },
  'app:companionPickerFilters': { category: 'no-payload', reason: 'returns static filters' },
  'app:checkForUpdate': { category: 'no-payload', reason: 'queries the release feed' },
  'diagnostics:build': { category: 'no-payload', reason: 'assembles the report in main' },
  'diagnostics:revealLogs': { category: 'no-payload', reason: 'opens the log directory' },
  'dialog:openDirectory': {
    category: 'no-payload',
    reason: 'the only dialog with no filters or defaultPath'
  },
  'pack:listActive': { category: 'no-payload', reason: 'lists loaded packs' },
  'pack:listImageEntries': { category: 'no-payload', reason: 'lists entries of loaded packs' },
  'pack:suggestedBrigidAssetsPath': { category: 'no-payload', reason: 'returns a derived path' },
  'pack:reload': { category: 'no-payload', reason: 'reloads from configured sources' },
  'theme:list': { category: 'no-payload', reason: 'lists the themes directory' },

  // ── path-only ─────────────────────────────────────────────────────────────
  'fs:readFile': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'fs:listDir': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'fs:listSection': {
    category: 'path-only',
    reason: 'library path via assertInsideAnyRoot; `type` via assertInside against it'
  },
  'fs:copyFile': { category: 'path-only', reason: 'both paths via assertInsideAnyRoot' },
  'fs:moveFile': { category: 'path-only', reason: 'both paths via assertInsideAnyRoot' },
  'fs:exists': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'fs:stat': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'fs:ensureDir': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'fs:deleteFile': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'fs:listArchive': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'catalog:load': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'catalog:scan': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'music:readFileMeta': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'music:scan': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'music:metadata:load': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'music:packs:load': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'music:client:scan': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'sfx:list': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'sfx:index:load': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'index:read': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'index:build': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'index:status': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'index:delete': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'library:resolve': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'prefab:list': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'prefab:load': { category: 'path-only', reason: 'library root + filename via assertInside' },
  'prefab:delete': { category: 'path-only', reason: 'library root + filename via assertInside' },
  'prefab:rename': {
    category: 'path-only',
    reason: 'both names are filenames, each via assertInside against the prefab dir'
  },
  'pack:scan': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'pack:load': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'pack:delete': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'pack:addAsset': {
    category: 'path-only',
    reason: 'pack dir + source via assertInsideAnyRoot, target filename via assertInside'
  },
  'pack:removeAsset': { category: 'path-only', reason: 'pack dir + filename via assertInside' },
  'pack:renameAsset': {
    category: 'path-only',
    reason: 'pack dir + two filenames, both via assertInside; refuses to overwrite'
  },
  'palette:scan': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'palette:load': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'palette:delete': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'palette:calibrationLoad': {
    category: 'path-only',
    reason: 'pack dir via assertInsideAnyRoot; palette id composes a filename via assertInside'
  },
  'frame:scan': { category: 'path-only', reason: 'assertInsideAnyRoot' },
  'theme:load': {
    category: 'path-only',
    reason: 'filename via assertInside against the themes dir'
  },
  'theme:delete': {
    category: 'path-only',
    reason: 'filename via assertInside against the themes dir'
  },

  // ── registry-key ──────────────────────────────────────────────────────────
  'pack:listCoveredIds': {
    category: 'registry-key',
    reason: 'subtype keys an in-memory coverage map; an unknown key returns an empty list'
  },
  'pack:resolveAsset': {
    category: 'registry-key',
    reason: 'subtype + id key the same map; a miss returns null'
  },
  'pack:trackMeta': {
    category: 'registry-key',
    reason: 'subtype + id key the same map; a miss returns null'
  },
  'pack:readEntry': {
    category: 'registry-key',
    reason: 'pack file via assertInsideAnyRoot; the entry path keys the archive, never the disk'
  },
  'sfx:readEntry': {
    category: 'registry-key',
    reason: 'client path via assertInsideAnyRoot; the entry name keys legend.dat in memory'
  }
}

const EXEMPT_CATEGORIES = new Set(['no-payload', 'path-only', 'registry-key'])

describe('IPC schema coverage', () => {
  it('finds the channels and the parse sites at all', () => {
    // Guards the two regexes above. If either stops matching — a formatting
    // change, a rename — every other assertion in this file would pass
    // vacuously against an empty set, which is the one way a test like this
    // fails silently.
    expect(registeredChannels.length).toBeGreaterThan(80)
    expect(validatedChannels.size).toBeGreaterThan(15)
  })

  it('registers no channel twice', () => {
    const dupes = registeredChannels.filter((c, i) => registeredChannels.indexOf(c) !== i)
    expect(dupes, `channels registered more than once: ${dupes.join(', ')}`).toEqual([])
  })

  it('accounts for every registered channel — validated, or exempt with a reason', () => {
    const unaccounted = registeredChannels.filter((c) => !isValidated(c) && !EXEMPT[c])
    expect(
      unaccounted,
      `These IPC channels validate no payload and are not listed as exempt:\n` +
        unaccounted.map((c) => `  - ${c}`).join('\n') +
        `\n\nAdd a parseOrLog(ctx, '<channel>', <schema>, payload) call, or add the channel to ` +
        `EXEMPT in this file with the category and the reason it needs none. See HTOO-162.`
    ).toEqual([])
  })

  it('carries no stale exempt entry for a channel that no longer exists', () => {
    const registered = new Set(registeredChannels)
    const stale = Object.keys(EXEMPT).filter((c) => !registered.has(c))
    expect(stale, `EXEMPT names channels that are not registered: ${stale.join(', ')}`).toEqual([])
  })

  it('does not exempt a channel that is also validated', () => {
    // A contradiction rather than a redundancy: whichever of the two is wrong,
    // the reason recorded against the channel no longer describes it.
    const both = Object.keys(EXEMPT).filter((c) => isValidated(c))
    expect(both, `listed as exempt but also parsed: ${both.join(', ')}`).toEqual([])
  })

  it('gives every exempt channel a known category and a non-empty reason', () => {
    for (const [channel, { category, reason }] of Object.entries(EXEMPT)) {
      expect(EXEMPT_CATEGORIES.has(category), `${channel}: unknown category "${category}"`).toBe(
        true
      )
      expect(reason.length, `${channel}: empty reason`).toBeGreaterThan(0)
    }
  })

  it('validates every channel whose payload it writes or executes', () => {
    // The list the card is actually about. Spelled out rather than derived, so
    // that removing a parse from any one of them fails HERE, naming it, instead
    // of quietly moving it to the exempt table.
    const mustValidate = [
      'settings:save',
      'catalog:save',
      'music:metadata:save',
      'music:packs:save',
      'music:deploy-pack',
      'sfx:index:save',
      'prefab:save',
      'pack:save',
      'pack:compile',
      'pack:import',
      'palette:save',
      'palette:calibrationSave',
      'theme:save',
      'fs:writeFile',
      'fs:writeBytes',
      'bik:convert',
      'tileScan:analyze',
      'maps:scanWarpReferrers',
      'maps:updateWarpTargets',
      'dialog:openFile',
      'dialog:openFiles',
      'dialog:saveFile',
      'diagnostics:reportRendererError',
      'diagnostics:openIssue',
      'diagnostics:copyReport'
    ]
    for (const channel of mustValidate) {
      expect(registeredChannels, `${channel} is no longer registered`).toContain(channel)
      expect(isValidated(channel), `${channel} no longer parses its payload`).toBe(true)
    }
  })
})
