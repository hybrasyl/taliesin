import { describe, it, expect } from 'vitest'
import { createWheelStepper, isPinch } from '../wheel'

// HTOO-569. A trackpad pinch on macOS is Ctrl + wheel with small deltas.
describe('isPinch', () => {
  it('is Ctrl + wheel on macOS only', () => {
    expect(isPinch({ ctrlKey: true }, 'darwin')).toBe(true)
    expect(isPinch({ ctrlKey: false }, 'darwin')).toBe(false)
    expect(isPinch({ ctrlKey: true }, 'win32')).toBe(false)
  })
})

describe('createWheelStepper', () => {
  it('gives one step for one mouse notch, at once', () => {
    const step = createWheelStepper()
    expect(step(100)).toBe(1)
    expect(step(-100)).toBe(-1)
  })

  it('adds up a pinch, so one gesture does not zoom through every level', () => {
    const step = createWheelStepper(40)
    const steps = [-6, -6, -6, -6, -6, -6, -6].map(step)
    // 42 in all: one step, on the seventh event.
    expect(steps.filter((s) => s !== 0)).toEqual([-1])
    expect(steps[6]).toBe(-1)
  })

  it('cancels a delta in the other direction', () => {
    const step = createWheelStepper(40)
    expect(step(30)).toBe(0)
    expect(step(-30)).toBe(0)
    expect(step(30)).toBe(0)
  })
})
