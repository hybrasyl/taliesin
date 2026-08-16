import { describe, it, expect } from 'vitest'
import {
  referenceFilenameFor,
  fieldOfReferenceFilename,
  isReferenceFilename,
  LEGACY_REFERENCE_FILENAME
} from '../worldMapData'

describe('referenceFilenameFor', () => {
  it('names the set for the field it serves', () => {
    expect(referenceFilenameFor('field001')).toBe('ReferenceMapSet.field001.xml')
    expect(referenceFilenameFor('field010')).toBe('ReferenceMapSet.field010.xml')
  })

  it('falls back to the legacy name when there is no field yet', () => {
    expect(referenceFilenameFor('')).toBe(LEGACY_REFERENCE_FILENAME)
  })

  it('round-trips with fieldOfReferenceFilename', () => {
    for (const f of ['field000', 'field005', 'field010']) {
      expect(fieldOfReferenceFilename(referenceFilenameFor(f))).toBe(f)
    }
  })
})

describe('fieldOfReferenceFilename', () => {
  it('returns the field for a field-specific set', () => {
    expect(fieldOfReferenceFilename('ReferenceMapSet.field001.xml')).toBe('field001')
  })

  it('returns null for the legacy set, which serves no declared field', () => {
    expect(fieldOfReferenceFilename('ReferenceMapSet.xml')).toBeNull()
  })

  it('returns undefined for anything that is not a reference set', () => {
    // undefined and null are different answers: "not one" versus "the legacy one".
    expect(fieldOfReferenceFilename('LouresSet.xml')).toBeUndefined()
    expect(fieldOfReferenceFilename('MasterMapSet.xml')).toBeUndefined()
    expect(fieldOfReferenceFilename('ReferenceMapSet.field001.json')).toBeUndefined()
    expect(fieldOfReferenceFilename('MyReferenceMapSet.xml')).toBeUndefined()
  })

  it('is case-insensitive on the name, because the filesystem may be', () => {
    expect(fieldOfReferenceFilename('referencemapset.FIELD001.xml')).toBe('FIELD001')
    expect(fieldOfReferenceFilename('REFERENCEMAPSET.XML')).toBeNull()
  })
})

describe('isReferenceFilename', () => {
  it('accepts both the legacy name and a field name', () => {
    expect(isReferenceFilename('ReferenceMapSet.xml')).toBe(true)
    expect(isReferenceFilename('ReferenceMapSet.field003.xml')).toBe(true)
  })

  it('rejects an ordinary map set', () => {
    expect(isReferenceFilename('FiathraSet.xml')).toBe(false)
    expect(isReferenceFilename('ArthiraSet.xml')).toBe(false)
  })
})
