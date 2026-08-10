import { describe, it, expect } from 'vitest'
import { decodeTownMapId, TOWN_SUBZONES, FIRST_GENERAL_SLOT, type Subzone } from '../townSubzones'

// HTOO-356. A town map's id is `30000 + town * 100 + subzone`, verified across
// `world/xml/maps` — every id-prefixed XML follows it.

describe('decodeTownMapId', () => {
  // The map HTOO-344 used as its motivating example, and the reason this
  // registry is worth having: the id already said what the map was.
  it('decodes the Tagor tavern', () => {
    expect(decodeTownMapId(30909)).toMatchObject({
      town: 9,
      slot: 9,
      subzone: { slot: 9, role: 'Tavern' },
      general: false
    })
  })

  it('decodes the first map of a town', () => {
    expect(decodeTownMapId(30200)).toMatchObject({ town: 2, slot: 0, general: false })
    expect(decodeTownMapId(30200)?.subzone?.role).toBe('Town')
  })

  it('decodes a two-digit town number', () => {
    expect(decodeTownMapId(31025)).toMatchObject({ town: 10, slot: 25 })
    expect(decodeTownMapId(31025)?.subzone?.role).toBe('Inn')
  })

  // Most maps in a world are not town maps. Offering a subzone for a wilderness
  // map would be inventing information.
  it('returns null outside the town range', () => {
    expect(decodeTownMapId(500)).toBeNull()
    expect(decodeTownMapId(29999)).toBeNull()
    expect(decodeTownMapId(40000)).toBeNull()
    expect(decodeTownMapId(0)).toBeNull()
  })

  it('returns null for a non-integer id', () => {
    expect(decodeTownMapId(30909.5)).toBeNull()
    expect(decodeTownMapId(NaN)).toBeNull()
  })

  it('includes both ends of the range', () => {
    expect(decodeTownMapId(30000)).toMatchObject({ town: 0, slot: 0 })
    expect(decodeTownMapId(39999)).toMatchObject({ town: 99, slot: 99 })
  })

  it('marks a high slot as general town, with no role', () => {
    const decoded = decodeTownMapId(30000 + FIRST_GENERAL_SLOT)
    expect(decoded?.general).toBe(true)
    expect(decoded?.subzone).toBeUndefined()
  })

  it('does not mark an assigned slot as general', () => {
    expect(decodeTownMapId(30937)?.general).toBe(false)
  })
})

describe('the registry', () => {
  it('runs from 0 to the first general slot with no gaps', () => {
    expect(TOWN_SUBZONES.map((s: Subzone) => s.slot)).toEqual(
      Array.from({ length: FIRST_GENERAL_SLOT }, (_, i) => i)
    )
  })

  it('gives every slot a role', () => {
    expect(TOWN_SUBZONES.every((s) => s.role.trim().length > 0)).toBe(true)
  })

  // The slot numbers confirmed against all three towns in `world` that use the
  // scheme. If these move, existing maps stop decoding correctly.
  it('pins the slots the corpus confirms', () => {
    const role = (slot: number): string | undefined =>
      TOWN_SUBZONES.find((s) => s.slot === slot)?.role
    expect(role(2)).toBe('Armor Smith')
    expect(role(4)).toBe('Bank')
    expect(role(9)).toBe('Tavern')
    expect(role(10)).toBe('Alchemist')
    expect(role(18)).toBe('Town Hall')
    expect(role(25)).toBe('Inn')
  })

  it('runs the inn rooms in order', () => {
    for (let room = 1; room <= 10; room++) {
      expect(TOWN_SUBZONES.find((s) => s.slot === 26 + room)?.role).toBe(`Inn Room ${room}`)
    }
  })
})
