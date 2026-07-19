import { describe, it, expect } from 'vitest'
import { buildDiagnosticsBlock, formatErrorLine } from '../diagnosticsBlock'

describe('formatErrorLine', () => {
  it('renders a head line without a stack', () => {
    expect(
      formatErrorLine({ timestamp: '2026-07-18T00:00:00.000Z', source: 'react', message: 'boom' })
    ).toBe('2026-07-18T00:00:00.000Z [react] main :: boom')
  })

  it('flattens a multi-line stack into a single line', () => {
    expect(formatErrorLine({ message: 'boom', stack: 'Error: boom\n  at a\n  at b' })).toBe(
      '[error] main :: boom | Error: boom | at a | at b'
    )
  })

  it('supplies sensible defaults for an empty entry', () => {
    expect(formatErrorLine()).toBe('[error] main ::')
  })
})

describe('buildDiagnosticsBlock', () => {
  it('orders app / os / errors and notes when there are none', () => {
    expect(
      buildDiagnosticsBlock({ productName: 'Taliesin', version: '2.7.0', os: 'windows' })
    ).toBe(
      [
        'App: Taliesin 2.7.0',
        'OS: windows',
        '--- recent errors (scrubbed) ---',
        'No errors captured this session.'
      ].join('\n')
    )
  })

  it('renders each error entry as a line', () => {
    const block = buildDiagnosticsBlock({
      productName: 'Taliesin',
      version: '2.7.0',
      os: 'linux',
      errors: [{ message: 'first' }, { message: 'second' }]
    })
    expect(block).toContain('[error] main :: first')
    expect(block).toContain('[error] main :: second')
    expect(block).not.toContain('No errors captured')
  })
})
