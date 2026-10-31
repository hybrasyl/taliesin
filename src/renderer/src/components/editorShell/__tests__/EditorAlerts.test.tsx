// house module: editor-shell v1 — change it in the template, then port
import React, { useState } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  EditorAlert,
  EditorAlertsArea,
  EditorAlertsProvider,
  useEditorAlert,
  type EditorAlertData
} from '../EditorAlerts'

function Notice({ id, alert }: { id: string; alert: EditorAlertData | null }) {
  const inArea = useEditorAlert(id, alert)
  return !inArea && alert ? <EditorAlert alert={alert} /> : null
}

function Toggle(): React.JSX.Element {
  const [on, setOn] = useState(true)
  return (
    <>
      <button onClick={() => setOn(false)}>off</button>
      <Notice id="t" alert={on ? { severity: 'info', message: 'Toggle notice' } : null} />
    </>
  )
}

describe('EditorAlerts', () => {
  it('shows each alert in the area, in order, and the worst severity', () => {
    render(
      <EditorAlertsProvider>
        <Notice id="b" alert={{ order: 2, severity: 'warning', message: 'Second' }} />
        <Notice id="a" alert={{ order: 1, severity: 'error', message: 'First', items: ['x'] }} />
        <EditorAlertsArea />
      </EditorAlertsProvider>
    )
    const area = screen.getByTestId('editor-alerts')
    expect(area.textContent).toMatch(/Alerts \(2\).*First.*x.*Second/)
  })

  it('removes an alert that becomes null', async () => {
    render(
      <EditorAlertsProvider>
        <Toggle />
        <EditorAlertsArea />
      </EditorAlertsProvider>
    )
    expect(screen.getByText('Toggle notice')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'off' }))
    expect(screen.queryByTestId('editor-alerts')).toBeNull()
  })

  it('collapses the area from its button', async () => {
    render(
      <EditorAlertsProvider>
        <Notice id="a" alert={{ severity: 'info', message: 'Note' }} />
        <EditorAlertsArea />
      </EditorAlertsProvider>
    )
    const head = screen.getByRole('button', { name: 'Alerts (1)' })
    await userEvent.click(head)
    expect(head).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders in place outside a provider', () => {
    render(<Notice id="a" alert={{ severity: 'info', message: 'In place', testId: 'here' }} />)
    expect(screen.getByTestId('here')).toHaveTextContent('In place')
  })
})
