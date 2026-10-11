import { describe, it, expect, vi } from 'vitest'
import { join } from 'path'
import { dialogDefaultPath, pickerStartPath, withPickerStart } from '../pickerStart'

const docs = join('/home/me/Documents')
const onDisk = new Set([
  join('/'),
  join('/client'),
  join('/client', 'legend.dat'),
  join('/home/me'),
  docs
])
const exists = async (p: string): Promise<boolean> => onDisk.has(p)

describe('pickerStartPath', () => {
  it('takes the first candidate that exists', async () => {
    expect(await pickerStartPath([join('/client'), join('/home/me')], exists)).toBe(join('/client'))
  })

  it('skips a stale setting, an empty string and a missing value', async () => {
    expect(await pickerStartPath([null, undefined, '', join('/moved'), docs], exists)).toBe(docs)
  })

  it('returns undefined when nothing exists, so the dialog gets no defaultPath', async () => {
    expect(await pickerStartPath([join('/nope')], exists)).toBeUndefined()
  })
})

describe('dialogDefaultPath', () => {
  const start = async (): Promise<string | undefined> => docs

  it('uses the start folder when the renderer names nothing', async () => {
    expect(await dialogDefaultPath(undefined, start, 'open', exists)).toBe(docs)
    expect(await dialogDefaultPath('', start, 'save', exists)).toBe(docs)
  })

  it('keeps an open path that exists, and does not look for a start folder', async () => {
    const noStart = vi.fn(start)
    expect(await dialogDefaultPath(join('/client'), noStart, 'open', exists)).toBe(join('/client'))
    expect(noStart).not.toHaveBeenCalled()
  })

  it('keeps a save path whose folder exists, although the file is new', async () => {
    const path = join('/client', 'new.datf')
    expect(await dialogDefaultPath(path, start, 'save', exists)).toBe(path)
  })

  it('puts a bare save name in the start folder, not in Downloads', async () => {
    expect(await dialogDefaultPath('map.png', start, 'save', exists)).toBe(join(docs, 'map.png'))
  })

  it('moves a stale save path to the start folder and keeps its name', async () => {
    const stale = join('/moved', 'pack.datf')
    expect(await dialogDefaultPath(stale, start, 'save', exists)).toBe(join(docs, 'pack.datf'))
  })

  it('opens in the folder of a file that is gone', async () => {
    const gone = join('/client', 'maps', 'lod001.map')
    onDisk.add(join('/client', 'maps'))
    expect(await dialogDefaultPath(gone, start, 'open', exists)).toBe(join('/client', 'maps'))
    onDisk.delete(join('/client', 'maps'))
  })

  it('opens at the start folder, with no name, when the path and its folder are gone', async () => {
    expect(await dialogDefaultPath(join('/moved', 'packs'), start, 'open', exists)).toBe(docs)
  })

  it('never hands an open dialog a bare name', async () => {
    expect(await dialogDefaultPath('maps', start, 'open', exists)).toBe(docs)
  })

  it('passes the request through when there is no start folder', async () => {
    const none = async (): Promise<undefined> => undefined
    expect(await dialogDefaultPath('map.png', none, 'save', exists)).toBe('map.png')
    expect(await dialogDefaultPath(undefined, none, 'open', exists)).toBeUndefined()
    expect(await dialogDefaultPath('maps', none, 'open', exists)).toBeUndefined()
  })
})

describe('withPickerStart', () => {
  function setup(clientPath: string | null = null) {
    const inner = {
      showOpenDialog: vi.fn(async (_opts: Electron.OpenDialogOptions) => ({
        canceled: false,
        filePaths: [] as string[]
      })),
      showSaveDialog: vi.fn(async (_opts: Electron.SaveDialogOptions) => ({
        canceled: false,
        filePath: undefined as string | undefined
      }))
    }
    const dialog = withPickerStart(inner, {
      clientPath: () => clientPath,
      fallbacks: () => [docs, join('/home/me')],
      exists
    })
    const lastOpen = (): unknown => inner.showOpenDialog.mock.calls.at(-1)?.[0]
    const lastSave = (): unknown => inner.showSaveDialog.mock.calls.at(-1)?.[0]
    return { inner, dialog, lastOpen, lastSave }
  }

  it('opens in the client folder, then in Documents when there is none', async () => {
    const withClient = setup(join('/client'))
    await withClient.dialog.showOpenDialog({ properties: ['openDirectory'] })
    expect(withClient.lastOpen()).toMatchObject({ defaultPath: join('/client') })

    const without = setup(null)
    await without.dialog.showOpenDialog({ properties: ['openDirectory'] })
    expect(without.lastOpen()).toMatchObject({ defaultPath: docs })
  })

  it('opens the next dialog in the folder of the last pick', async () => {
    const { inner, dialog, lastOpen, lastSave } = setup()
    inner.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [join('/client', 'legend.dat')]
    })
    await dialog.showOpenDialog({ properties: ['openFile'] })
    await dialog.showSaveDialog({ defaultPath: 'map.png' })
    expect(lastSave()).toMatchObject({ defaultPath: join('/client', 'map.png') })

    inner.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [join('/home/me')] })
    await dialog.showOpenDialog({ properties: ['openDirectory'] })
    await dialog.showOpenDialog({ properties: ['openFile'] })
    expect(lastOpen()).toMatchObject({ defaultPath: join('/home/me') })
  })

  it('keeps the other options and returns the inner result', async () => {
    const { inner, dialog, lastOpen } = setup()
    const filters = [{ name: 'Maps', extensions: ['map'] }]
    inner.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    expect(await dialog.showOpenDialog({ properties: ['openFile'], filters })).toEqual({
      canceled: true,
      filePaths: []
    })
    expect(lastOpen()).toMatchObject({ properties: ['openFile'], filters })
  })
})
