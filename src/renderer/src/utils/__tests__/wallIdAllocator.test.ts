import { describe, it, expect } from 'vitest'
import {
  WALL_ID_MINT_MIN,
  WALL_ID_MINT_MAX,
  isRenderedTileIndex,
  isMintableWallId,
  wallWalkability,
  nextWallId
} from '../wallIdAllocator'

describe('isRenderedTileIndex — Brigid sentinel filter', () => {
  it('treats 0–12 as non-rendered sentinels', () => {
    for (let id = 0; id <= 12; id++) expect(isRenderedTileIndex(id)).toBe(false)
  })
  it('treats 10000–10012 as non-rendered sentinels', () => {
    for (let id = 10000; id <= 10012; id++) expect(isRenderedTileIndex(id)).toBe(false)
  })
  it('renders the legacy wall range 13–9999', () => {
    expect(isRenderedTileIndex(13)).toBe(true)
    expect(isRenderedTileIndex(9999)).toBe(true)
  })
  it('renders minted ids 10013+', () => {
    expect(isRenderedTileIndex(10013)).toBe(true)
    expect(isRenderedTileIndex(20423)).toBe(true)
  })
})

describe('isMintableWallId — [10013, 20423] window', () => {
  it('accepts the window boundaries', () => {
    expect(isMintableWallId(WALL_ID_MINT_MIN)).toBe(true)
    expect(isMintableWallId(WALL_ID_MINT_MAX)).toBe(true)
    expect(WALL_ID_MINT_MIN).toBe(10013)
    expect(WALL_ID_MINT_MAX).toBe(20423)
  })
  it('rejects just below and just above the window', () => {
    expect(isMintableWallId(10012)).toBe(false) // last sentinel
    expect(isMintableWallId(20424)).toBe(false) // server crash territory
  })
  it('rejects non-integers', () => {
    expect(isMintableWallId(10013.5)).toBe(false)
  })
})

describe('wallWalkability — sotp.dat semantics', () => {
  // 1-based: byte for id N at [N-1]. Low nibble 0x0f == 0 → passable.
  const sotp = new Uint8Array(20423)
  sotp[10013 - 1] = 0x0f // blocking
  sotp[10014 - 1] = 0x00 // passable
  sotp[10015 - 1] = 0x80 // property bit only → passable (collision nibble is 0)
  sotp[10016 - 1] = 0x8f // property bit + blocking nibble → blocking

  it('reads blocking vs passable from the low nibble', () => {
    expect(wallWalkability(sotp, 10013)).toBe('blocking')
    expect(wallWalkability(sotp, 10014)).toBe('passable')
  })
  it('ignores the property bit (0x80) for collision', () => {
    expect(wallWalkability(sotp, 10015)).toBe('passable')
    expect(wallWalkability(sotp, 10016)).toBe('blocking')
  })
  it('returns unknown out of range or with no table', () => {
    expect(wallWalkability(sotp, 999999)).toBe('unknown')
    expect(wallWalkability(sotp, 0)).toBe('unknown')
    expect(wallWalkability(null, 10013)).toBe('unknown')
  })
})

describe('nextWallId — allocation', () => {
  it('starts at the mintable minimum with nothing used', () => {
    expect(nextWallId()).toBe(10013)
  })
  it('skips used ids', () => {
    expect(nextWallId({ used: [10013, 10014, 10016] })).toBe(10015)
  })
  it('never returns an id outside [10013, 20423]', () => {
    const id = nextWallId({ min: 10013, max: 10013, used: [] })
    expect(id).toBe(10013)
    // window fully consumed → null, never a sentinel or out-of-range id
    expect(nextWallId({ min: 10013, max: 10013, used: [10013] })).toBeNull()
  })
  it('filters by requested walkability when a table is present', () => {
    const sotp = new Uint8Array(20423)
    sotp[10013 - 1] = 0x0f // blocking
    sotp[10014 - 1] = 0x00 // passable
    expect(nextWallId({ sotp, passability: 'passable' })).toBe(10014)
    expect(nextWallId({ sotp, passability: 'blocking' })).toBe(10013)
  })
  it('degrades to range-only when passability is requested but no table exists', () => {
    expect(nextWallId({ passability: 'blocking', sotp: null })).toBe(10013)
  })
  it('accepts a Set for used', () => {
    expect(nextWallId({ used: new Set([10013]) })).toBe(10014)
  })
})
