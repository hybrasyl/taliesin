import { describe, it, expect } from 'vitest'
import {
  applyNumericSpec,
  formatUsesMax,
  renderFormat,
  sampleForPath,
  sampleForType
} from '../formatPreview'

describe('applyNumericSpec', () => {
  it('formats fixed decimals', () => {
    expect(applyNumericSpec(12.5, '0.0')).toBe('12.5')
    expect(applyNumericSpec(12.345, '0.00')).toBe('12.35')
    expect(applyNumericSpec(12.9, '0')).toBe('13')
  })

  it('applies thousands grouping', () => {
    expect(applyNumericSpec(1234567, '#,##0')).toBe('1,234,567')
  })

  it('ignores the spec for non-numeric samples', () => {
    expect(applyNumericSpec('Aisling', '0.0')).toBe('Aisling')
    expect(applyNumericSpec(true, '0')).toBe('true')
  })
})

describe('renderFormat', () => {
  it('substitutes value and max', () => {
    expect(renderFormat('{value}/{max}', 1200, 1500)).toBe('1200/1500')
  })

  it('applies numeric specs per token', () => {
    expect(renderFormat('{value:0.0}%', 12.5)).toBe('12.5%')
  })

  it('shows ? for a missing sample but keeps literal text', () => {
    expect(renderFormat('HP {value}/{max}', 1200, undefined)).toBe('HP 1200/?')
  })

  it('leaves plain text untouched', () => {
    expect(renderFormat('static', undefined)).toBe('static')
  })
})

describe('sampleForType / sampleForPath', () => {
  it('gives type defaults', () => {
    expect(sampleForType('string')).toBe('Sample')
    expect(sampleForType('bool')).toBe(true)
    expect(typeof sampleForType('float')).toBe('number')
  })

  it('prefers a catalog sample when the path is known', () => {
    expect(sampleForPath('player.hp')).toBe(1200)
    expect(sampleForPath('player.stats.str')).toBe(42) // type default (no explicit sample)
    expect(sampleForPath('unknown.path')).toBeUndefined()
    expect(sampleForPath(undefined)).toBeUndefined()
  })
})

describe('formatUsesMax', () => {
  it('detects {max} with or without a spec', () => {
    expect(formatUsesMax('{value}/{max}')).toBe(true)
    expect(formatUsesMax('{max:0.0}')).toBe(true)
    expect(formatUsesMax('{value}')).toBe(false)
  })
})
