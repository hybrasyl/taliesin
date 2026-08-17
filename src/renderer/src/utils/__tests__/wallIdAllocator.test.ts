import { describe, it, expect } from 'vitest'
import { SotpFile } from '@eriscorp/dalib-ts'
import {
  WALL_ID_MIN,
  WALL_ID_MAX,
  isRenderedTileIndex,
  isCommittableWallId,
  isReclaimableWallId,
  reclaimableWallIdCount,
  RECLAIMABLE_WALL_IDS,
  EMPTY_WALL_ID_BAND,
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
  it('renders everything above the second sentinel band', () => {
    expect(isRenderedTileIndex(10013)).toBe(true)
    expect(isRenderedTileIndex(20423)).toBe(true)
  })
})

describe('isCommittableWallId — the only two hard limits', () => {
  it('accepts the whole rendered range up to the server ceiling', () => {
    expect(isCommittableWallId(WALL_ID_MIN)).toBe(true)
    expect(isCommittableWallId(WALL_ID_MAX)).toBe(true)
    expect(WALL_ID_MIN).toBe(13)
    expect(WALL_ID_MAX).toBe(20423)
  })

  it('accepts a low legacy id, which the mint window used to refuse', () => {
    // WLD-44: the [10013, 20423] window belongs to the SOTP overlay, not to
    // committing art. These are ids the world card lists as free to overwrite.
    expect(isCommittableWallId(3025)).toBe(true)
    expect(isCommittableWallId(25)).toBe(true)
    expect(isCommittableWallId(8111)).toBe(true)
  })

  it('refuses an id the client never draws', () => {
    expect(isCommittableWallId(12)).toBe(false)
    expect(isCommittableWallId(10000)).toBe(false)
    expect(isCommittableWallId(10012)).toBe(false)
  })

  it('refuses an id past the server ceiling, which crashes map load', () => {
    expect(isCommittableWallId(20424)).toBe(false)
  })

  it('refuses a non-integer and a non-positive id', () => {
    expect(isCommittableWallId(3025.5)).toBe(false)
    expect(isCommittableWallId(0)).toBe(false)
    expect(isCommittableWallId(-13)).toBe(false)
  })
})

describe('the reclaimable pool (WLD-44)', () => {
  it('holds the reviewed ids and the empty band', () => {
    // 1274 preferred for overwrite less the 45 still placed, plus the 992 the
    // legacy client has no art for at all.
    expect(reclaimableWallIdCount()).toBe(1274 - 45 + 992)
  })

  it('includes the empty band, which has no legacy art to overwrite at all', () => {
    // These fired "not in the reclaimable pool — may carry legacy art a map
    // places" when they are the one part of the table that carries none.
    const [lo, hi] = EMPTY_WALL_ID_BAND
    expect([lo, hi]).toEqual([9008, 9999])
    expect(hi - lo + 1).toBe(992)
    for (const id of [9008, 9200, 9201, 9999]) {
      expect(isReclaimableWallId(id)).toBe(true)
      expect(isCommittableWallId(id)).toBe(true)
    }
  })

  it('stops the empty band where the legacy art resumes', () => {
    expect(isReclaimableWallId(9007)).toBe(false)
    expect(isReclaimableWallId(10000)).toBe(false)
  })

  it('is sorted and does not overlap itself', () => {
    for (let i = 0; i < RECLAIMABLE_WALL_IDS.length; i++) {
      const [lo, hi] = RECLAIMABLE_WALL_IDS[i]!
      expect(lo).toBeLessThanOrEqual(hi)
      if (i > 0) expect(lo).toBeGreaterThan(RECLAIMABLE_WALL_IDS[i - 1]![1])
    }
  })

  it('holds only ids that can be committed', () => {
    for (const [lo, hi] of RECLAIMABLE_WALL_IDS) {
      expect(isCommittableWallId(lo)).toBe(true)
      expect(isCommittableWallId(hi)).toBe(true)
    }
  })

  it('leaves out every id the card says is still placed in a map', () => {
    const placed = [
      24, 61, 72, 2908, 2909, 2914, 2915, 2936, 2956, 2957, 2962, 3072, 3079, 3108, 3115, 3139,
      3140, 3167, 3168, 3174, 3192, 3199, 3228, 3235, 3370, 4837, 4838, 4847, 4848, 8555, 8556,
      8557, 11822, 11823, 11824, 11825, 11826, 11827, 11828, 11829, 14740, 14741, 18547, 18548,
      18675
    ]
    expect(placed).toHaveLength(45)
    for (const id of placed) expect(isReclaimableWallId(id)).toBe(false)
  })

  it('keeps the ids either side of an excluded one', () => {
    expect(isReclaimableWallId(14739)).toBe(true)
    expect(isReclaimableWallId(14742)).toBe(true)
    expect(isReclaimableWallId(18546)).toBe(true)
    expect(isReclaimableWallId(18549)).toBe(true)
  })
})

describe('wallWalkability — sotp.dat semantics', () => {
  // The SAME fixture bytes as before the SotpFile adoption, now handed to the
  // parser instead of indexed by hand. Identical expectations below are the
  // evidence that the refactor preserved behaviour.
  // 1-based: byte for id N at [N-1]. Low nibble 0x0f == 0 → passable.
  const bytes = new Uint8Array(20423)
  bytes[10013 - 1] = 0x0f // blocking
  bytes[10014 - 1] = 0x00 // passable
  bytes[10015 - 1] = 0x80 // property bit only → passable (collision nibble is 0)
  bytes[10016 - 1] = 0x8f // property bit + blocking nibble → blocking
  const sotp = SotpFile.fromBuffer(bytes)

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

  it('does NOT let dalib turn an out-of-range id into passable', () => {
    // The trap WP5 names. SotpFile.getFlags returns 0 past the end of the
    // table, and 0 reads as passable — so deferring the range check to dalib
    // would silently convert every 'unknown' into 'passable', and the allocator
    // would hand out ids nothing knows anything about as free passable slots.
    expect(sotp.getCollision(999999)).toBe(0) // dalib's answer: looks passable
    expect(wallWalkability(sotp, 999999)).toBe('unknown') // ours: still unknown
    expect(sotp.maxTileId).toBe(20423)
    expect(wallWalkability(sotp, 20423)).not.toBe('unknown') // the last real id
    expect(wallWalkability(sotp, 20424)).toBe('unknown') // one past it
  })
})

describe('nextWallId — allocation', () => {
  it('starts at the bottom of the reclaimable pool, not at 10013', () => {
    expect(nextWallId()).toBe(25)
  })
  it('skips used ids', () => {
    expect(nextWallId({ used: [25, 26, 35] })).toBe(36)
  })
  it('crosses a gap in the pool rather than returning an id beside it', () => {
    // 25-26 then 35-38: nothing between is offered.
    expect(nextWallId({ used: [25, 26] })).toBe(35)
  })
  it('searches the whole legal range when asked', () => {
    expect(nextWallId({ anyId: true })).toBe(13)
  })
  it('returns null when everything it can offer is taken', () => {
    const all: number[] = []
    for (const [lo, hi] of RECLAIMABLE_WALL_IDS) for (let id = lo; id <= hi; id++) all.push(id)
    expect(nextWallId({ used: all })).toBeNull()
  })
  it('filters by requested walkability when a table is present', () => {
    const bytes = new Uint8Array(20423)
    bytes[25 - 1] = 0x0f // blocking
    bytes[26 - 1] = 0x00 // passable
    const sotp = SotpFile.fromBuffer(bytes)
    expect(nextWallId({ sotp, passability: 'passable' })).toBe(26)
    expect(nextWallId({ sotp, passability: 'blocking' })).toBe(25)
  })
  it('degrades to range-only when passability is requested but no table exists', () => {
    expect(nextWallId({ passability: 'blocking', sotp: null })).toBe(25)
  })
  it('accepts a Set for used', () => {
    expect(nextWallId({ used: new Set([25]) })).toBe(26)
  })
})
