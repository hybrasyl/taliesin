import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BindingEditor from '../BindingEditor'
import type { UiControl } from '../../../uiforge/types'

function control(over: Partial<UiControl>): UiControl {
  return { kind: 'label', name: 'c', rect: { x: 0, y: 0, w: 10, h: 4 }, ...over }
}

describe('BindingEditor', () => {
  it('renders nothing for a button (buttons never bind)', () => {
    const { container } = render(
      <BindingEditor control={control({ kind: 'button' })} onChange={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('flags a type mismatch on a progressbar bound to a string', () => {
    render(
      <BindingEditor
        control={control({ kind: 'progressbar', binding: { path: 'player.name' } })}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText('Type not compatible with this control')).toBeInTheDocument()
  })

  it('warns (not errors) on an unknown path and still allows it', () => {
    render(
      <BindingEditor
        control={control({ kind: 'label', binding: { path: 'made.up.var' } })}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText(/Not in catalog/)).toBeInTheDocument()
  })

  it('renders a live format preview using catalog samples', () => {
    render(
      <BindingEditor
        control={control({
          kind: 'label',
          binding: { path: 'player.hp', maxPath: 'player.maxhp', format: '{value}/{max}' }
        })}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText('Preview (approx.)')).toBeInTheDocument()
    expect(screen.getByText('1200/1500')).toBeInTheDocument()
  })

  it('flags {max} used without a bind-max', () => {
    render(
      <BindingEditor
        control={control({
          kind: 'label',
          binding: { path: 'player.hp', format: '{value}/{max}' }
        })}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText('{max} used but no bind-max set')).toBeInTheDocument()
  })

  it('commits a typed bind path via onChange', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<BindingEditor control={control({ kind: 'label' })} onChange={onChange} />)
    const bind = screen.getByLabelText('Bind')
    await user.type(bind, 'player.gold')
    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ path: 'player.gold' })
  })
})
