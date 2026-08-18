import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TilePositionFields, { clampCoord } from '../TilePositionFields'

/**
 * Every placement dialog showed its coordinates as a caption and nothing more,
 * so moving a node one tile meant deleting it and placing it again (HTOO-441).
 * These are the fields that replaced the caption.
 */

describe('clampCoord', () => {
  it('holds a value inside the map', () => {
    expect(clampCoord('39', 39)).toBe(39)
    expect(clampCoord('400', 39)).toBe(39)
    expect(clampCoord('-4', 39)).toBe(0)
  })

  it('rejects a value that is not a number, so the field is not emptied to 0', () => {
    expect(clampCoord('', 39)).toBeNull()
    expect(clampCoord('abc', 39)).toBeNull()
  })
})

describe('TilePositionFields', () => {
  it('reports a typed X and keeps Y', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TilePositionFields x={4} y={7} maxX={39} maxY={39} onChange={onChange} />)

    await user.type(screen.getByLabelText('Tile X'), '9')
    // '4' + '9' = 49, clamped to the map.
    expect(onChange).toHaveBeenLastCalledWith(39, 7)
  })

  it('reports a typed Y and keeps X', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TilePositionFields x={4} y={0} maxX={39} maxY={39} onChange={onChange} />)

    await user.type(screen.getByLabelText('Tile Y'), '2')
    expect(onChange).toHaveBeenLastCalledWith(4, 2)
  })

  it('says nothing while the field is empty', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TilePositionFields x={4} y={7} maxX={39} maxY={39} onChange={onChange} />)

    await user.clear(screen.getByLabelText('Tile X'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('names what the pair addresses, because a warp has two of them', () => {
    // A warp has a position on this map and an arrival position on the
    // destination map. Two unlabelled pairs on one screen are a coin toss.
    render(<TilePositionFields x={0} y={0} maxX={639} maxY={479} onChange={vi.fn()} noun="Field" />)
    expect(screen.getByLabelText('Field X')).toBeTruthy()
    expect(screen.getByLabelText('Field Y')).toBeTruthy()
  })

  it('states the bound it clamps to', () => {
    render(<TilePositionFields x={0} y={0} maxX={39} maxY={19} onChange={vi.fn()} />)
    expect(screen.getByText('Where it sits, 0–39')).toBeTruthy()
    expect(screen.getByText('Where it sits, 0–19')).toBeTruthy()
  })
})
