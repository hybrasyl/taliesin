import React, { useState } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  EditorAlertsArea,
  EditorAlertsProvider,
  useEditorAlert,
  type EditorAlertData
} from '../EditorAlerts'

/**
 * The alerts registry (HTOO-633). A notice is data, so a re-render registers an
 * equal value and nothing loops. The area sorts by order, and a notice leaves
 * the area when its component unmounts or passes null.
 */

function Notice({ id, alert }: { id: string; alert: EditorAlertData | null }): null {
  useEditorAlert(id, alert)
  return null
}

function Harness(): React.ReactElement {
  const [showB, setShowB] = useState(true)
  return (
    <EditorAlertsProvider>
      <EditorAlertsArea />
      <Notice id="a" alert={{ order: 20, severity: 'warning', message: 'Second' }} />
      {showB && <Notice id="b" alert={{ order: 10, severity: 'error', message: 'First' }} />}
      <button onClick={() => setShowB(false)}>drop b</button>
    </EditorAlertsProvider>
  )
}

describe('EditorAlerts', () => {
  it('shows the notices in order, and drops one that unmounts', async () => {
    render(<Harness />)
    const items = screen.getAllByRole('alert').map((el) => el.textContent)
    expect(items).toEqual(['First', 'Second'])
    expect(screen.getByRole('button', { name: 'Alerts (2)' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'drop b' }))
    expect(screen.getAllByRole('alert').map((el) => el.textContent)).toEqual(['Second'])
  })

  it('collapses from its header', async () => {
    render(<Harness />)
    const header = screen.getByRole('button', { name: 'Alerts (2)' })
    await userEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders nothing when no notice is registered', () => {
    render(
      <EditorAlertsProvider>
        <EditorAlertsArea />
        <Notice id="a" alert={null} />
      </EditorAlertsProvider>
    )
    expect(screen.queryByTestId('editor-alerts')).toBeNull()
  })

  it('says there is no area outside a provider', () => {
    let shown: boolean | undefined
    function Probe(): null {
      shown = useEditorAlert('x', { severity: 'info', message: 'x' })
      return null
    }
    render(<Probe />)
    expect(shown).toBe(false)
  })
})
