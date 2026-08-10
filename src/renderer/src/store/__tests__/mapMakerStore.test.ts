import { describe, it, expect, beforeEach } from 'vitest'
import { MapFile } from '@eriscorp/dalib-ts'
import {
  createTab,
  resetMapMakerStore,
  tabLabel,
  useMapMakerStore,
  type MapTab
} from '../mapMakerStore'

beforeEach(resetMapMakerStore)

const store = () => useMapMakerStore.getState()
const ids = (): string[] => store().tabs.map((t) => t.id)

/** Open n tabs and return them in order. */
function openTabs(n: number): MapTab[] {
  const tabs = Array.from({ length: n }, () => createTab(new MapFile(2, 2)))
  tabs.forEach((t) => store().addTab(t))
  return tabs
}

describe('createTab', () => {
  it('starts clean, unsaved and with empty history', () => {
    const tab = createTab(new MapFile(4, 4))
    expect(tab.dirty).toBe(false)
    expect(tab.filePath).toBeNull()
    expect(tab.undoStack).toEqual([])
    expect(tab.redoStack).toEqual([])
    expect(tab.selection).toBeNull()
  })

  it('gives every tab a distinct id and canvas key', () => {
    const a = createTab()
    const b = createTab()
    expect(a.id).not.toBe(b.id)
    expect(a.canvasKey).not.toBe(b.canvasKey)
  })
})

describe('tabLabel', () => {
  it('names a saved tab after its file', () => {
    expect(tabLabel(createTab(new MapFile(1, 1), 'C:/maps/lod00001.map'))).toBe('lod00001.map')
  })

  it('distinguishes an unsaved map from an empty tab', () => {
    expect(tabLabel(createTab(new MapFile(1, 1)))).toBe('Untitled')
    expect(tabLabel(createTab(null))).toBe('Empty')
  })
})

describe('addTab', () => {
  it('appends and activates', () => {
    const [first, second] = openTabs(2)
    expect(ids()).toEqual([first.id, second.id])
    expect(store().activeTabId).toBe(second.id)
  })
})

describe('updateTab', () => {
  it('patches only the named tab', () => {
    const [a, b] = openTabs(2)
    store().updateTab(a.id, { dirty: true })
    expect(store().tabs.find((t) => t.id === a.id)?.dirty).toBe(true)
    expect(store().tabs.find((t) => t.id === b.id)?.dirty).toBe(false)
  })

  it('ignores an unknown id rather than inventing a tab', () => {
    openTabs(1)
    store().updateTab('nope', { dirty: true })
    expect(store().tabs).toHaveLength(1)
    expect(store().tabs[0].dirty).toBe(false)
  })
})

describe('removeTab', () => {
  it('activates the neighbour when the active tab closes', () => {
    const [a, b, c] = openTabs(3)
    store().setActiveTabId(b.id)
    store().removeTab(b.id)
    expect(ids()).toEqual([a.id, c.id])
    // c slid into b's index, so it is what the user is now looking at.
    expect(store().activeTabId).toBe(c.id)
  })

  it('falls back to the last tab when the rightmost closes', () => {
    const [a, b] = openTabs(2)
    store().setActiveTabId(b.id)
    store().removeTab(b.id)
    expect(store().activeTabId).toBe(a.id)
  })

  it('leaves the selection alone when a background tab closes', () => {
    const [a, b] = openTabs(2)
    store().setActiveTabId(b.id)
    store().removeTab(a.id)
    expect(store().activeTabId).toBe(b.id)
  })

  it('clears the selection when the last tab closes', () => {
    const [only] = openTabs(1)
    store().removeTab(only.id)
    expect(store().tabs).toEqual([])
    expect(store().activeTabId).toBeNull()
  })

  it('never leaves activeTabId pointing at a closed tab', () => {
    // Removal and re-selection share one set() precisely so no render can
    // observe the gap between them.
    const tabs = openTabs(4)
    for (const tab of tabs) {
      store().setActiveTabId(tab.id)
      store().removeTab(tab.id)
      const { activeTabId, tabs: rest } = store()
      if (activeTabId !== null) expect(rest.some((t) => t.id === activeTabId)).toBe(true)
    }
    expect(store().tabs).toEqual([])
  })
})

describe('closeAllTabs', () => {
  it('releases every open map', () => {
    openTabs(3)
    store().closeAllTabs()
    expect(store().tabs).toEqual([])
    expect(store().activeTabId).toBeNull()
  })
})

describe('surviving navigation', () => {
  it('keeps tabs, their maps and their undo history across a page change', () => {
    // The bug this store exists to fix: the Map Maker page unmounts on
    // navigation, and as component state every open map went with it.
    const tab = createTab(new MapFile(8, 8), 'C:/maps/lod00001.map', true)
    store().addTab(tab)
    store().updateTab(tab.id, {
      undoStack: [[{ x: 1, y: 1, layer: 'background', oldValue: 0, newValue: 5 }]]
    })

    // Nothing here is tied to a component, so a remount sees the same state.
    const survived = store().tabs[0]
    expect(survived.mapFile?.width).toBe(8)
    expect(survived.dirty).toBe(true)
    expect(survived.undoStack).toHaveLength(1)
    expect(store().activeTabId).toBe(tab.id)
  })
})

describe('the clipboard', () => {
  // HTOO-339. The clipboard used to be a field on MapTab, so copying in tab A
  // and pasting in tab B pasted whatever B last copied — or nothing, silently.
  const region = {
    tiles: [{ background: 7, leftForeground: 0, rightForeground: 0 }],
    w: 1,
    h: 1
  }

  it('is one payload for every tab', () => {
    const [a, b] = openTabs(2)
    store().setActiveTabId(a.id)
    store().setClipboard(region)
    store().setActiveTabId(b.id)
    expect(store().clipboard).toEqual(region)
  })

  it('survives closing the tab it was copied from', () => {
    const [a, b] = openTabs(2)
    store().setActiveTabId(a.id)
    store().setClipboard(region)
    store().removeTab(a.id)
    expect(store().activeTabId).toBe(b.id)
    expect(store().clipboard).toEqual(region)
  })

  it('is last-write-wins, like every other application', () => {
    const second = { tiles: region.tiles, w: 2, h: 2 }
    store().setClipboard(region)
    store().setClipboard(second)
    expect(store().clipboard).toBe(second)
  })

  it('outlives closeAllTabs — that releases the maps, not the payload', () => {
    openTabs(2)
    store().setClipboard(region)
    store().closeAllTabs()
    expect(store().clipboard).toEqual(region)
  })

  // pasteMode stays per-tab: it is a tool state ("you are placing a paste on
  // this canvas"), not clipboard content. Hoisting it would arm paste mode on
  // tabs the user has not touched.
  it('does not carry paste mode between tabs', () => {
    const [a, b] = openTabs(2)
    store().setClipboard(region)
    store().updateTab(a.id, { pasteMode: true })
    expect(store().tabs.find((t) => t.id === b.id)?.pasteMode).toBe(false)
  })
})
