import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MapEditorPanel from '../MapEditorPanel'
import { EditorAlertsProvider } from '../../shared/EditorAlerts'
import { resetStores } from '../../../__tests__/setup/storeWrapper'
import { useSettingsStore } from '../../../store/settingsStore'
import { useUiStore } from '../../../store/uiStore'
import { DEFAULT_MAP, type MapData, type MapWarp } from '../../../data/mapData'

/**
 * The map editor's layout (HTOO-633): no tabs, Properties as a section above
 * the placement map that remembers whether it is open, and the notices in the
 * alerts area under the header.
 */

const warp = (x: number, y: number): MapWarp => ({
  x,
  y,
  targetType: 'map',
  mapTargetName: 'Abel',
  mapTargetX: 1,
  mapTargetY: 1
})

function renderPanel(
  patch: Partial<MapData> = {},
  props: Partial<React.ComponentProps<typeof MapEditorPanel>> = {}
) {
  const saveRef = { current: null } as React.MutableRefObject<(() => Promise<void>) | null>
  return render(
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
        onSave={vi.fn()}
        onDirtyChange={vi.fn()}
        saveRef={saveRef}
        {...props}
      />
    </EditorAlertsProvider>
  )
}

beforeEach(() => {
  resetStores()
  useUiStore.setState({ currentPage: 'mapeditor' })
})

describe('MapEditorPanel — Properties above the map', () => {
  it('has no tabs, and shows the fields and the map together', () => {
    const { container } = renderPanel()
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(container.querySelectorAll('canvas').length).toBeGreaterThan(0)
  })

  it('remembers whether the section is open', async () => {
    renderPanel()
    const toggle = screen.getByRole('button', { name: 'Properties' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(useSettingsStore.getState().mapPropertiesOpen).toBe(false)
  })

  it('opens closed when the setting says so', () => {
    useSettingsStore.setState({ mapPropertiesOpen: false })
    renderPanel()
    expect(screen.getByRole('button', { name: 'Properties' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })
})

describe('MapEditorPanel — the alerts area', () => {
  it('shows the duplicate-warp notice under the header, with Properties closed', () => {
    useSettingsStore.setState({ mapPropertiesOpen: false })
    renderPanel({ warps: [warp(4, 5), warp(4, 5)] })
    const area = screen.getByTestId('editor-alerts')
    expect(within(area).getByTestId('duplicate-warp-alert').textContent).toContain('(4,5)')
    // Once: in the area, not also in place.
    expect(screen.getAllByTestId('duplicate-warp-alert')).toHaveLength(1)
  })

  it('names the other active map that has the same Id', () => {
    renderPanel(
      {},
      {
        activeMapIds: new Map([[500, ['lod00500.xml', 'Mileth copy.xml']]])
      }
    )
    const alert = screen.getByTestId('shared-map-id-alert')
    expect(alert.textContent).toContain('Id 500')
    expect(alert.textContent).toContain('Mileth copy.xml')
    // Its own file is not the conflict.
    expect(alert.textContent).not.toContain('lod00500.xml')
  })

  it('says nothing about the Id when no other map has it', () => {
    renderPanel({}, { activeMapIds: new Map([[500, ['lod00500.xml']]]) })
    expect(screen.queryByTestId('shared-map-id-alert')).toBeNull()
  })
})
