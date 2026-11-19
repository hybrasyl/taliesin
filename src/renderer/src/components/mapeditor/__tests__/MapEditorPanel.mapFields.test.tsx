import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MapEditorPanel from '../MapEditorPanel'
import { EditorAlertsProvider } from '../../editorShell/EditorAlerts'
import { resetStores } from '../../../__tests__/setup/storeWrapper'
import { installMockApi, type MockApi } from '../../../__tests__/setup/mockApi'
import { useUiStore } from '../../../store/uiStore'
import { DEFAULT_MAP, type MapData } from '../../../data/mapData'

/** The map's Script and AmbientSound in the Properties section (HTOO-624). */

let api: MockApi

function renderPanel(patch: Partial<MapData> = {}) {
  const saveRef = { current: null } as React.MutableRefObject<(() => Promise<void>) | null>
  const onSave = vi.fn(async (_data: MapData, _fileName: string, _folder: string) => {})
  const onDirtyChange = vi.fn()
  const utils = render(
    <EditorAlertsProvider>
      <MapEditorPanel
        map={{ ...DEFAULT_MAP, id: 500, name: 'Mileth', x: 20, y: 20, ...patch }}
        initialFileName="lod00500.xml"
        initialFolder=""
        folderOptions={[]}
        isArchived={false}
        isExisting
        fileRel="lod00500.xml"
        mapNames={[]}
        npcNames={[]}
        worldMapNames={[]}
        spawnGroupNames={[]}
        onSave={onSave}
        onDirtyChange={onDirtyChange}
        saveRef={saveRef}
      />
    </EditorAlertsProvider>
  )
  return { saveRef, onSave, onDirtyChange, ...utils }
}

beforeEach(() => {
  resetStores()
  api = installMockApi()
  api.packReload.mockResolvedValue(undefined)
  api.packListCoveredIds.mockResolvedValue([])
  useUiStore.setState({ currentPage: 'mapeditor' })
})

// The typing cases are slow under the full coverage run: on Linux 'saves what
// was typed' took 5.2 s there (2.0 s alone), past the 5 s default, so 15 s.
describe('MapEditorPanel — map Script and AmbientSound', { timeout: 15000 }, () => {
  it('shows the values the map carries', () => {
    renderPanel({ ambientSound: 4, script: 'mileth_map' })
    expect(screen.getByLabelText('Ambient Sound')).toHaveValue(4)
    expect(screen.getByLabelText('Map Script')).toHaveValue('mileth_map')
  })

  it('opening a map with neither field does not mark it dirty', async () => {
    const { onDirtyChange } = renderPanel()
    // Let the pack scan and the Autocomplete settle.
    await waitFor(() => expect(api.packListCoveredIds).toHaveBeenCalled())
    expect(onDirtyChange).not.toHaveBeenCalledWith(true)
  })

  it('loading another map with a different script does not mark it dirty', async () => {
    const { rerender, onDirtyChange, saveRef } = renderPanel({ script: 'first' })
    const next = { ...DEFAULT_MAP, id: 501, name: 'Abel', x: 20, y: 20, script: 'second' }
    rerender(
      <EditorAlertsProvider>
        <MapEditorPanel
          map={next}
          initialFileName="lod00501.xml"
          initialFolder=""
          folderOptions={[]}
          isArchived={false}
          isExisting
          fileRel="lod00501.xml"
          mapNames={[]}
          npcNames={[]}
          worldMapNames={[]}
          spawnGroupNames={[]}
          onSave={vi.fn()}
          onDirtyChange={onDirtyChange}
          saveRef={saveRef}
        />
      </EditorAlertsProvider>
    )
    await waitFor(() => expect(screen.getByLabelText('Map Script')).toHaveValue('second'))
    expect(onDirtyChange).not.toHaveBeenCalledWith(true)
  })

  it('saves what was typed in both fields', async () => {
    const user = userEvent.setup()
    const { saveRef, onSave, onDirtyChange } = renderPanel()
    await user.type(screen.getByLabelText('Ambient Sound'), '12')
    await user.type(screen.getByLabelText('Map Script'), 'town_script')
    expect(onDirtyChange).toHaveBeenCalledWith(true)
    await saveRef.current?.()
    const saved = onSave.mock.calls[0]![0] as MapData
    expect(saved.ambientSound).toBe(12)
    expect(saved.script).toBe('town_script')
  })

  it('clearing the script removes it from the map', async () => {
    const user = userEvent.setup()
    const { saveRef, onSave } = renderPanel({ script: 'old' })
    await user.clear(screen.getByLabelText('Map Script'))
    await saveRef.current?.()
    expect((onSave.mock.calls[0]![0] as MapData).script).toBeUndefined()
  })
})
