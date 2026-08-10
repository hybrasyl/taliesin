// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { extractComments, reinjectComments } from '../xmlComments'

// HTOO-344. `serializeMapXml` rebuilds the document from the model, so it emits
// only what it is told to — and comments are not in the model. Three production
// maps carry hand-written notes that Taliesin deleted on the first save.

describe('extractComments', () => {
  it('addresses a comment by its container and the siblings before it', () => {
    const xml = `<Map Id="1">
  <Name>A</Name>
  <!-- a note -->
  <Npcs />
</Map>`
    expect(extractComments(xml)).toEqual([
      { path: [{ name: 'Map', nth: 1 }], index: 1, text: ' a note ' }
    ])
  })

  // The real ones sit inside <Spawns>, next to the spawn they are about — not
  // at the top of the file, which is where a root-anchored scheme would put
  // them back.
  it('addresses a nested comment', () => {
    const xml = `<Map Id="1">
  <SpawnGroup Name="g" BaseLevel="1">
    <Spawns>
      <!-- Needs new spawn group possibly after revamp -->
      <Spawn Import="DubEast4-1" Flags="Active"/>
    </Spawns>
  </SpawnGroup>
</Map>`
    expect(extractComments(xml)).toEqual([
      {
        path: [
          { name: 'Map', nth: 1 },
          { name: 'SpawnGroup', nth: 1 },
          { name: 'Spawns', nth: 1 }
        ],
        index: 0,
        text: ' Needs new spawn group possibly after revamp '
      }
    ])
  })

  it('counts only elements, so two comments in a row keep distinct addresses', () => {
    const xml = `<Map Id="1">
  <!-- first -->
  <Name>A</Name>
  <!-- second -->
</Map>`
    const got = extractComments(xml)
    expect(got.map((c) => [c.index, c.text])).toEqual([
      [0, ' first '],
      [1, ' second ']
    ])
  })

  it('returns nothing rather than throwing on unparseable xml', () => {
    expect(extractComments('<Map><oops>')).toEqual([])
  })

  it('returns nothing for a document with no comments', () => {
    expect(extractComments('<Map Id="1"><Name>A</Name></Map>')).toEqual([])
  })
})

describe('reinjectComments', () => {
  /** Round-trip: read the comments out of `xml`, put them into `into`. */
  function carry(xml: string, into: string): string {
    return reinjectComments(into, extractComments(xml))
  }

  it('puts a root-level comment back between the same siblings', () => {
    const original = `<Map Id="1">
  <Name>A</Name>
  <!-- a note -->
  <Npcs />
</Map>`
    const rebuilt = `<Map Id="1">
  <Name>A</Name>
  <Npcs />
</Map>`
    expect(carry(original, rebuilt)).toBe(original)
  })

  // The whole point: the note stays beside the spawn it describes.
  it('puts a nested comment back inside its own container', () => {
    const original = `<Map Id="1">
  <SpawnGroup Name="g" BaseLevel="1">
    <Spawns>
      <!-- Needs new spawn group possibly after revamp -->
      <Spawn Import="DubEast4-1" Flags="Active" />
    </Spawns>
  </SpawnGroup>
</Map>`
    const rebuilt = original.replace(/\s*<!--.*?-->\n/, '\n')
    expect(carry(original, rebuilt)).toBe(original)
  })

  it('puts a trailing comment back before its container closes', () => {
    const original = `<Map Id="1">
  <Spawns>
    <Spawn Import="a" />
    <!-- after the last spawn -->
  </Spawns>
</Map>`
    const rebuilt = original.replace(/\s*<!--.*?-->\n/, '\n')
    expect(carry(original, rebuilt)).toBe(original)
  })

  // Two same-named siblings are told apart by `nth`, so a note on the second
  // group does not surface on the first.
  it('tells same-named containers apart', () => {
    const original = `<Map Id="1">
  <SpawnGroup Name="one">
    <Spawns>
      <Spawn Import="a" />
    </Spawns>
  </SpawnGroup>
  <SpawnGroup Name="two">
    <Spawns>
      <!-- about the second group -->
      <Spawn Import="b" />
    </Spawns>
  </SpawnGroup>
</Map>`
    const rebuilt = original.replace(/\s*<!--.*?-->\n/, '\n')
    expect(carry(original, rebuilt)).toBe(original)
  })

  it('survives an unrelated edit elsewhere in the document', () => {
    const original = `<Map Id="1">
  <Name>Old</Name>
  <Spawns>
    <!-- keep me -->
    <Spawn Import="a" />
  </Spawns>
</Map>`
    const edited = `<Map Id="1">
  <Name>New</Name>
  <Spawns>
    <Spawn Import="a" />
  </Spawns>
</Map>`
    const out = carry(original, edited)
    expect(out).toContain('<Name>New</Name>')
    expect(out).toContain('    <!-- keep me -->\n    <Spawn Import="a" />')
  })

  // A note filed against a group that has since been deleted has nothing left
  // to describe. Dropping it beats re-homing it somewhere it reads as a comment
  // about something else.
  it('drops a comment whose container is gone', () => {
    const original = `<Map Id="1">
  <Spawns>
    <!-- about a deleted group -->
    <Spawn Import="a" />
  </Spawns>
</Map>`
    const rebuilt = `<Map Id="1">
  <Name>A</Name>
</Map>`
    expect(carry(original, rebuilt)).toBe(rebuilt)
  })

  it('leaves the text untouched when there is nothing to put back', () => {
    const xml = '<Map Id="1">\n  <Name>A</Name>\n</Map>'
    expect(reinjectComments(xml, [])).toBe(xml)
  })

  it('does not mistake a self-closing element for a container', () => {
    const original = `<Map Id="1">
  <Npcs />
  <!-- after the npcs -->
  <Signs />
</Map>`
    const rebuilt = original.replace(/\s*<!--.*?-->\n/, '\n')
    expect(carry(original, rebuilt)).toBe(original)
  })

  it('does not mistake a one-line element with text for a container', () => {
    const original = `<Map Id="1">
  <Name>A</Name>
  <!-- after the name -->
  <Npcs />
</Map>`
    const rebuilt = original.replace(/\s*<!--.*?-->\n/, '\n')
    expect(carry(original, rebuilt)).toBe(original)
  })
})
