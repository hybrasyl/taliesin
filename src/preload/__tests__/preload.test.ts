import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Source files (read at test time, not imported — these reference electron at module load).
// Handler registrations moved from main/index.ts → main/handlers.ts in Phase 5.
const PRELOAD  = readFileSync(join(__dirname, '..', 'index.ts'), 'utf-8')
const HANDLERS = readFileSync(join(__dirname, '..', '..', 'main', 'handlers.ts'), 'utf-8')

const CHANNEL_RE = /['"]([\w:.\-]+)['"]/g

function extractChannels(source: string, callPattern: RegExp): Set<string> {
  const channels = new Set<string>()
  for (const match of source.matchAll(callPattern)) {
    const inner = match[0]
    CHANNEL_RE.lastIndex = 0
    const first = CHANNEL_RE.exec(inner)
    if (first) channels.add(first[1])
  }
  return channels
}

const preloadInvoke = extractChannels(PRELOAD, /ipcRenderer\.invoke\(\s*['"][^'"]+['"]/g)
const preloadSend   = extractChannels(PRELOAD, /ipcRenderer\.send\(\s*['"][^'"]+['"]/g)
const mainHandle    = extractChannels(HANDLERS,    /ipcMain\.handle\(\s*['"][^'"]+['"]/g)
const mainOn        = extractChannels(HANDLERS,    /ipcMain\.on\(\s*['"][^'"]+['"]/g)

describe('Preload ↔ Main IPC contract', () => {
  it('every channel preload sends has a matching ipcMain.on handler', () => {
    const missing = [...preloadSend].filter(c => !mainOn.has(c))
    expect(missing).toEqual([])
  })

  it('every channel preload invokes has a matching ipcMain.handle handler', () => {
    const missing = [...preloadInvoke].filter(c => !mainHandle.has(c))
    expect(missing).toEqual([])
  })

  it('every ipcMain.on handler is reachable from preload', () => {
    const orphaned = [...mainOn].filter(c => !preloadSend.has(c))
    expect(orphaned).toEqual([])
  })

  it('every ipcMain.handle handler is reachable from preload', () => {
    const orphaned = [...mainHandle].filter(c => !preloadInvoke.has(c))
    expect(orphaned).toEqual([])
  })

  it('locks the preload channel set with a snapshot (catches accidental additions/removals)', () => {
    const all = [...preloadInvoke, ...preloadSend].sort()
    expect(all).toMatchInlineSnapshot(`
      [
        "app:getVersion",
        "app:launchCompanion",
        "catalog:load",
        "catalog:save",
        "catalog:scan",
        "close-window",
        "dialog:openDirectory",
        "dialog:openFile",
        "dialog:saveFile",
        "frame:scan",
        "fs:copyFile",
        "fs:deleteFile",
        "fs:ensureDir",
        "fs:exists",
        "fs:listArchive",
        "fs:listDir",
        "fs:readFile",
        "fs:writeBytes",
        "fs:writeFile",
        "get-user-data-path",
        "index:build",
        "index:delete",
        "index:read",
        "index:status",
        "library:resolve",
        "maximize-window",
        "minimize-window",
        "music:client:scan",
        "music:deploy-pack",
        "music:metadata:load",
        "music:metadata:save",
        "music:packs:load",
        "music:packs:save",
        "music:readFileMeta",
        "music:scan",
        "pack:addAsset",
        "pack:compile",
        "pack:delete",
        "pack:load",
        "pack:removeAsset",
        "pack:save",
        "pack:scan",
        "palette:calibrationLoad",
        "palette:calibrationSave",
        "palette:delete",
        "palette:load",
        "palette:save",
        "palette:scan",
        "prefab:delete",
        "prefab:list",
        "prefab:load",
        "prefab:rename",
        "prefab:save",
        "settings:load",
        "settings:save",
        "sfx:index:load",
        "sfx:index:save",
        "sfx:list",
        "sfx:readEntry",
        "theme:delete",
        "theme:list",
        "theme:load",
        "theme:save",
        "tileScan:analyze",
      ]
    `)
  })
})
