// house module: editor-shell v1 — change it in the template, then port
import { describe, it, expect } from 'vitest'
import { fileSet, selectionActions } from '../selectionActions'

const active = { path: 'a' }
const active2 = { path: 'a2' }
const archived = { path: 'b', archived: true }
const staged = { path: 'c', staged: true }

describe('selectionActions', () => {
  it('names the set of a file', () => {
    expect([active, archived, staged].map(fileSet)).toEqual(['active', 'archived', 'staged'])
  })

  it('enables nothing but the kinds for an empty selection, and gives no reason', () => {
    const a = selectionActions([], 'map')
    expect(a.archive).toMatchObject({ kind: 'archive', enabled: false, reason: undefined })
    expect(a.move).toMatchObject({ kind: 'stage', enabled: false, reason: undefined })
    expect(a.copy.enabled).toBe(false)
    expect(a.delete.enabled).toBe(false)
  })

  it('archives and stages active files, and duplicates only one', () => {
    const one = selectionActions([active], 'map')
    expect(one.archive).toMatchObject({ kind: 'archive', enabled: true })
    expect(one.move).toMatchObject({ kind: 'stage', enabled: true })
    expect(one.copy.enabled).toBe(true)
    const two = selectionActions([active, active2], 'map')
    expect(two.copy).toMatchObject({ enabled: false, reason: 'Duplicate takes one file' })
    expect(two.delete.enabled).toBe(true)
  })

  it('turns Archive into Unarchive for archived files, which cannot be staged', () => {
    const a = selectionActions([archived], 'map')
    expect(a.archive).toMatchObject({ kind: 'unarchive', label: 'Unarchive', enabled: true })
    expect(a.move).toMatchObject({
      kind: 'stage',
      enabled: false,
      reason: 'Unarchive this map before you stage it'
    })
  })

  it('turns Stage into Release for staged files, which cannot be archived', () => {
    const a = selectionActions([staged, { ...staged, path: 'c2' }], 'map')
    expect(a.move).toMatchObject({ kind: 'release', label: 'Release', enabled: true })
    expect(a.archive).toMatchObject({
      enabled: false,
      reason: 'Release these files before you archive them'
    })
  })

  it('applies neither move to a mix of sets, and says so', () => {
    const a = selectionActions([active, archived], 'map')
    expect(a.archive).toMatchObject({
      enabled: false,
      reason: 'Archive does not apply to a mix of sets'
    })
    expect(a.move).toMatchObject({
      enabled: false,
      reason: 'Stage does not apply to a mix of sets'
    })
    expect(a.delete.enabled).toBe(true)
  })
})
